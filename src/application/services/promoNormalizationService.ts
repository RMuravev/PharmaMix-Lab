import type { PromoFact } from '../../domain/shared/facts';
import { openPharmaDatabase } from '../../infrastructure/indexeddb/database';
import { requestResult, transactionDone } from '../../infrastructure/indexeddb/transaction';
import { normalizePromoRows } from './promoNormalizer';
import { assertLegacyWriteAllowed } from './legacyWriteGuard';

export interface PromoNormalizationReport { importedRows: number; skippedRows: number; issues: ReturnType<typeof normalizePromoRows>['issues']; datasetVersion: number; fingerprint: string }

/** Atomically publishes promo bonus facts and invalidates derived aggregates on source changes. */
export class PromoNormalizationService {
  async normalizeAndCommit(input: { projectId: string; rows: readonly unknown[]; sourceBatchId?: string }): Promise<PromoNormalizationReport> {
    await assertLegacyWriteAllowed(input.projectId);
    const normalized = normalizePromoRows(input.rows, input.projectId);
    if (!normalized.facts.length) throw new Error('Не удалось нормализовать ни одной строки промо; прежние данные сохранены.');
    const db = await openPharmaDatabase();
    const tx = db.transaction(['promoFacts', 'datasets', 'aggregates'], 'readwrite');
    const done = transactionDone(tx);
    const datasets = tx.objectStore('datasets');
    const existing = await requestResult(datasets.index('projectId_sourceType').get([input.projectId, 'promo'])) as { id: string; version: number; fingerprint: string } | undefined;
    const version = (existing?.version ?? 0) + (existing?.fingerprint === normalized.fingerprint ? 0 : 1);
    const datasetVersion = `${version}:${normalized.fingerprint}`;
    const facts: PromoFact[] = normalized.facts.map(fact => ({ ...fact, datasetVersion }));
    const store = tx.objectStore('promoFacts');
    const oldKeys = await requestResult(store.index('projectId').getAllKeys(IDBKeyRange.only(input.projectId)));
    oldKeys.forEach(key => store.delete(key));
    facts.forEach(fact => store.put(fact));
    const now = new Date().toISOString();
    datasets.put({ id: existing?.id ?? `${input.projectId}:promo`, projectId: input.projectId, sourceType: 'promo', version, fingerprint: normalized.fingerprint, updatedAt: now, schemaVersion: 1, rowCount: facts.length, sourceBatchId: input.sourceBatchId });
    if (existing?.fingerprint !== normalized.fingerprint) {
      const index = tx.objectStore('aggregates').index('projectId');
      await new Promise<void>((resolve, reject) => {
        const req = index.openCursor(IDBKeyRange.only(input.projectId));
        req.onerror = () => reject(req.error ?? new Error('Не удалось инвалидировать агрегаты.'));
        req.onsuccess = () => { const cursor = req.result; if (!cursor) { resolve(); return; }
          if (cursor.value.status === 'ready') cursor.update({ ...cursor.value, status: 'stale', updatedAt: now, staleReason: 'promo-dataset-changed' });
          cursor.continue(); };
      });
    }
    await done;
    return { importedRows: facts.length, skippedRows: normalized.skippedRows, issues: normalized.issues, datasetVersion: version, fingerprint: normalized.fingerprint };
  }
}
