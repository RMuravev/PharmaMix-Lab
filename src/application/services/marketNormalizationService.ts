import type { MarketFact } from '../../domain/shared/facts';
import { openPharmaDatabase } from '../../infrastructure/indexeddb/database';
import { requestResult, transactionDone } from '../../infrastructure/indexeddb/transaction';
import { normalizeMarketRows } from './marketNormalizer';
import { assertLegacyWriteAllowed } from './legacyWriteGuard';

export interface MarketNormalizationReport {
  importedRows: number; skippedRows: number;
  issues: ReturnType<typeof normalizeMarketRows>['issues'];
  datasetVersion: number; fingerprint: string;
}

/** Normalizes and atomically publishes market facts independently from own-chain sales. */
export class MarketNormalizationService {
  async normalizeAndCommit(input: { projectId: string; rows: readonly unknown[]; sourceBatchId?: string }): Promise<MarketNormalizationReport> {
    await assertLegacyWriteAllowed(input.projectId);
    const normalized = normalizeMarketRows(input.rows, input.projectId);
    if (!normalized.facts.length) throw new Error('Не удалось нормализовать ни одной строки рынка; прежние данные сохранены.');
    const db = await openPharmaDatabase();
    const tx = db.transaction(['marketFacts', 'datasets', 'aggregates'], 'readwrite');
    const done = transactionDone(tx);
    const datasets = tx.objectStore('datasets');
    const index = datasets.index('projectId_sourceType');
    const existing = await requestResult(index.get([input.projectId, 'market'])) as { id: string; version: number; fingerprint: string } | undefined;
    const version = (existing?.version ?? 0) + (existing?.fingerprint === normalized.fingerprint ? 0 : 1);
    const datasetVersion = `${version}:${normalized.fingerprint}`;
    const facts: MarketFact[] = normalized.facts.map(fact => ({ ...fact, datasetVersion }));
    const factStore = tx.objectStore('marketFacts');
    const oldKeys = await requestResult(factStore.index('projectId').getAllKeys(IDBKeyRange.only(input.projectId)));
    oldKeys.forEach(key => factStore.delete(key));
    facts.forEach(fact => factStore.put(fact));
    const now = new Date().toISOString();
    datasets.put({ id: existing?.id ?? `${input.projectId}:market`, projectId: input.projectId, sourceType: 'market', version,
      fingerprint: normalized.fingerprint, updatedAt: now, schemaVersion: 1, rowCount: facts.length, sourceBatchId: input.sourceBatchId });
    if (existing?.fingerprint !== normalized.fingerprint) {
      const aggregateIndex = tx.objectStore('aggregates').index('projectId');
      await new Promise<void>((resolve, reject) => {
        const req = aggregateIndex.openCursor(IDBKeyRange.only(input.projectId));
        req.onerror = () => reject(req.error ?? new Error('Не удалось инвалидировать агрегаты.'));
        req.onsuccess = () => {
          const cursor = req.result;
          if (!cursor) { resolve(); return; }
          if (cursor.value.status === 'ready') cursor.update({ ...cursor.value, status: 'stale', updatedAt: now, staleReason: 'market-dataset-changed' });
          cursor.continue();
        };
      });
    }
    await done;
    return { importedRows: facts.length, skippedRows: normalized.skippedRows, issues: normalized.issues, datasetVersion: version, fingerprint: normalized.fingerprint };
  }
}
