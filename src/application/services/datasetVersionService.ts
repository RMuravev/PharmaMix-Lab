import { openPharmaDatabase } from '../../infrastructure/indexeddb/database';
import { transactionDone } from '../../infrastructure/indexeddb/transaction';

export interface DatasetVersion {
  id: string;
  projectId: string;
  sourceType: string;
  version: number;
  fingerprint: string;
  updatedAt: string;
  schemaVersion: number;
}

/**
 * Tracks per-source fingerprints and marks dependent aggregates stale.
 * All reads and writes are scheduled from IndexedDB callbacks so the transaction
 * does not depend on remaining active across an awaited promise continuation.
 */
export class DatasetVersionService {
  async publish(projectId: string, sourceType: string, fingerprint: string): Promise<DatasetVersion> {
    if (!projectId.trim() || !sourceType.trim() || !fingerprint.trim()) {
      throw new Error('projectId, sourceType и fingerprint обязательны.');
    }
    const db = await openPharmaDatabase();
    const tx = db.transaction(['datasets', 'aggregates'], 'readwrite');
    const done = transactionDone(tx);
    const datasets = tx.objectStore('datasets');
    const aggregates = tx.objectStore('aggregates');
    const get = datasets.index('projectId_sourceType').get([projectId, sourceType]);
    let next: DatasetVersion | undefined;
    get.onsuccess = () => {
      try {
        const existing = get.result as DatasetVersion | undefined;
        const now = new Date().toISOString();
        const dataChanged = existing?.fingerprint !== fingerprint;
        next = {
          id: existing?.id ?? `${projectId}:${sourceType}`,
          projectId, sourceType,
          version: (existing?.version ?? 0) + (dataChanged ? 1 : 0),
          fingerprint, updatedAt: now, schemaVersion: 1,
        };
        datasets.put(next);
        if (!dataChanged) return;
        const cursorRequest = aggregates.index('projectId').openCursor(IDBKeyRange.only(projectId));
        cursorRequest.onerror = () => { try { tx.abort(); } catch { /* handled by done */ } };
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor) return;
          const row = cursor.value as { status?: string };
          if (row.status === 'ready') {
            cursor.update({ ...row, status: 'stale', staleReason: `dataset:${sourceType}`, updatedAt: now });
          }
          cursor.continue();
        };
      } catch {
        try { tx.abort(); } catch { /* handled by done */ }
      }
    };
    get.onerror = () => { try { tx.abort(); } catch { /* handled by done */ } };
    await done;
    if (!next) throw new Error('Не удалось сохранить версию набора данных.');
    return next;
  }
}
