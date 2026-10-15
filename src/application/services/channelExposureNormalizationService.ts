import type { TvFact, VisitFact } from '../../domain/shared/facts';
import { openPharmaDatabase } from '../../infrastructure/indexeddb/database';
import { requestResult, transactionDone } from '../../infrastructure/indexeddb/transaction';
import { normalizeTvRows, normalizeVisitRows } from './channelExposureNormalizer';
import { assertLegacyWriteAllowed } from './legacyWriteGuard';

export interface ExposureCommitReport { importedRows: number; skippedRows: number; issues: Array<{ row: number; field: string; message: string }>; datasetVersion: number; fingerprint: string }

async function commitFacts<T extends { id: string; projectId: string; datasetVersion: string }>(input: {
  projectId: string; sourceType: 'tv' | 'visits'; storeName: 'tvFacts' | 'visitFacts'; facts: T[];
  skippedRows: number; issues: Array<{ row: number; field: string; message: string }>; fingerprint: string; sourceBatchId?: string;
}): Promise<ExposureCommitReport> {
  if (!input.facts.length) throw new Error(`Не удалось нормализовать ни одной строки ${input.sourceType}; прежние данные сохранены.`);
  const db = await openPharmaDatabase();
  const tx = db.transaction([input.storeName, 'datasets', 'aggregates'], 'readwrite');
  const done = transactionDone(tx);
  const datasets = tx.objectStore('datasets');
  const existing = await requestResult(datasets.index('projectId_sourceType').get([input.projectId, input.sourceType])) as { id: string; version: number; fingerprint: string } | undefined;
  const changed = existing?.fingerprint !== input.fingerprint;
  const version = (existing?.version ?? 0) + (changed ? 1 : 0);
  const datasetVersion = `${version}:${input.fingerprint}`;
  const facts = input.facts.map(fact => ({ ...fact, datasetVersion }));
  const store = tx.objectStore(input.storeName);
  const oldKeys = await requestResult(store.index('projectId').getAllKeys(IDBKeyRange.only(input.projectId)));
  oldKeys.forEach(key => store.delete(key));
  facts.forEach(fact => store.put(fact));
  const now = new Date().toISOString();
  datasets.put({ id: existing?.id ?? `${input.projectId}:${input.sourceType}`, projectId: input.projectId, sourceType: input.sourceType,
    version, fingerprint: input.fingerprint, updatedAt: now, schemaVersion: 1, rowCount: facts.length, sourceBatchId: input.sourceBatchId });
  if (changed) {
    const aggregateIndex = tx.objectStore('aggregates').index('projectId');
    await new Promise<void>((resolve, reject) => {
      const req = aggregateIndex.openCursor(IDBKeyRange.only(input.projectId));
      req.onerror = () => reject(req.error ?? new Error('Не удалось инвалидировать агрегаты.'));
      req.onsuccess = () => { const cursor = req.result; if (!cursor) { resolve(); return; }
        if (cursor.value.status === 'ready') cursor.update({ ...cursor.value, status: 'stale', updatedAt: now, staleReason: `${input.sourceType}-dataset-changed` });
        cursor.continue(); };
    });
  }
  await done;
  return { importedRows: facts.length, skippedRows: input.skippedRows, issues: input.issues, datasetVersion: version, fingerprint: input.fingerprint };
}

export class ChannelExposureNormalizationService {
  async commitTv(input: { projectId: string; rows: readonly unknown[]; sourceBatchId?: string }): Promise<ExposureCommitReport> {
    await assertLegacyWriteAllowed(input.projectId);
    const normalized = normalizeTvRows(input.rows, input.projectId);
    return commitFacts<TvFact>({ ...input, sourceType: 'tv', storeName: 'tvFacts', ...normalized });
  }
  async commitVisits(input: { projectId: string; rows: readonly unknown[]; sourceBatchId?: string }): Promise<ExposureCommitReport> {
    await assertLegacyWriteAllowed(input.projectId);
    const normalized = normalizeVisitRows(input.rows, input.projectId);
    return commitFacts<VisitFact>({ ...input, sourceType: 'visits', storeName: 'visitFacts', ...normalized });
  }
}
