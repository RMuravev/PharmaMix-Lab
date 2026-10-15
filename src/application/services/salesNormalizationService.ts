import { normalizeSalesRows } from './salesNormalizer';
import type { SalesFact } from '../../domain/shared/facts';
import { openPharmaDatabase } from '../../infrastructure/indexeddb/database';
import { requestResult, transactionDone } from '../../infrastructure/indexeddb/transaction';
import { assertLegacyWriteAllowed } from './legacyWriteGuard';

export interface SalesNormalizationCommit {
  projectId: string;
  rows: readonly unknown[];
  sourceBatchId?: string;
}
export interface SalesNormalizationReport {
  importedRows: number;
  skippedRows: number;
  issues: ReturnType<typeof normalizeSalesRows>['issues'];
  datasetVersion: number;
  fingerprint: string;
}

/** Converts legacy imported sales into normalized facts and publishes the version atomically. */
export class SalesNormalizationService {
  async normalizeAndCommit(input: SalesNormalizationCommit): Promise<SalesNormalizationReport> {
    await assertLegacyWriteAllowed(input.projectId);
    const normalized = normalizeSalesRows(input.rows, input.projectId);
    if (!normalized.facts.length) throw new Error('Не удалось нормализовать ни одной строки продаж; исходные данные сохранены.');
    const db = await openPharmaDatabase();
    const tx = db.transaction(['salesFacts', 'datasets', 'aggregates'], 'readwrite');
    const done = transactionDone(tx);
    const datasets = tx.objectStore('datasets');
    const versionIndex = datasets.index('projectId_sourceType');
    const existing = await requestResult(versionIndex.get([input.projectId, 'sales'])) as { id: string; version: number; fingerprint: string } | undefined;
    const version = (existing?.version ?? 0) + (existing?.fingerprint === normalized.fingerprint ? 0 : 1);
    const datasetVersion = `${version}:${normalized.fingerprint}`;
    const facts: SalesFact[] = normalized.facts.map(fact => ({ ...fact, datasetVersion }));
    const factsStore = tx.objectStore('salesFacts');
    const oldKeys = await requestResult(factsStore.index('projectId').getAllKeys(IDBKeyRange.only(input.projectId)));
    oldKeys.forEach(key => factsStore.delete(key));
    facts.forEach(fact => factsStore.put(fact));
    const now = new Date().toISOString();
    datasets.put({ id: existing?.id ?? `${input.projectId}:sales`, projectId: input.projectId, sourceType: 'sales', version,
      fingerprint: normalized.fingerprint, updatedAt: now, schemaVersion: 1, rowCount: facts.length, sourceBatchId: input.sourceBatchId });
    if (existing?.fingerprint !== normalized.fingerprint) {
      const aggregateIndex = tx.objectStore('aggregates').index('projectId');
      await new Promise<void>((resolve, reject) => {
        const req = aggregateIndex.openCursor(IDBKeyRange.only(input.projectId));
        req.onerror = () => reject(req.error ?? new Error('Не удалось инвалидировать агрегаты.'));
        req.onsuccess = () => {
          const cursor = req.result;
          if (!cursor) { resolve(); return; }
          if (cursor.value.status === 'ready') cursor.update({ ...cursor.value, status: 'stale', updatedAt: now, staleReason: 'sales-dataset-changed' });
          cursor.continue();
        };
      });
    }
    await done;
    return { importedRows: facts.length, skippedRows: normalized.skippedRows, issues: normalized.issues, datasetVersion: version, fingerprint: normalized.fingerprint };
  }
}
