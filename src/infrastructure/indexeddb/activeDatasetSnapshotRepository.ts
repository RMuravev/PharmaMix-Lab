import { openPharmaDatabase } from './database';
import { transactionDone } from './transaction';
import type { FactStoreName, FactByStore, FactSnapshot } from '../../application/contracts/versionedFacts';

export interface ActiveDatasetSnapshot extends FactSnapshot {
  projectId: string;
  datasetVersion: string | null;
  rowCounts: Record<FactStoreName, number>;
}

const FACT_STORES: readonly FactStoreName[] = [
  'salesFacts', 'marketFacts', 'promoFacts', 'tvFacts', 'visitFacts',
];

/**
 * Reads the active pointer and all five fact stores in one readonly transaction.
 * This is the common consistency boundary for dashboards and analytics queries.
 * Without an active pointer the repository returns an empty current snapshot. It never
 * falls back to unversioned or orphaned facts from an unsupported database generation.
 */
export class ActiveDatasetSnapshotRepository {
  async getForProject(projectId: string): Promise<ActiveDatasetSnapshot> {
    if (!projectId.trim()) throw new Error('projectId обязателен.');
    const db = await openPharmaDatabase();
    const tx = db.transaction(['projects', ...FACT_STORES], 'readonly');
    const done = transactionDone(tx);

    const snapshot: ActiveDatasetSnapshot = {
      projectId,
      datasetVersion: null,
      salesFacts: [], marketFacts: [], promoFacts: [], tvFacts: [], visitFacts: [],
      rowCounts: { salesFacts: 0, marketFacts: 0, promoFacts: 0, tvFacts: 0, visitFacts: 0 },
    };

    const read = new Promise<void>((resolve, reject) => {
      const projectRequest = tx.objectStore('projects').get(projectId);
      projectRequest.onerror = () => reject(projectRequest.error ?? new Error('Не удалось прочитать проект.'));
      projectRequest.onsuccess = () => {
        const project = projectRequest.result as { activeDatasetVersion?: string } | undefined;
        const version = project?.activeDatasetVersion;
        snapshot.datasetVersion = version ?? null;
        if (!version) { resolve(); return; }
        let remaining = FACT_STORES.length;
        const readStore = <K extends FactStoreName>(storeName: K, assign: (rows: FactByStore[K][]) => void) => {
          const store = tx.objectStore(storeName);
          const request = store.index('projectId_datasetVersion').getAll(IDBKeyRange.only([projectId, version]));
          request.onerror = () => reject(request.error ?? new Error(`Не удалось прочитать ${storeName} активной версии.`));
          request.onsuccess = () => {
            const rows = request.result as FactByStore[K][];
            assign(rows);
            snapshot.rowCounts[storeName] = rows.length;
            remaining -= 1;
            if (remaining === 0) resolve();
          };
        };
        readStore('salesFacts', rows => { snapshot.salesFacts = rows; });
        readStore('marketFacts', rows => { snapshot.marketFacts = rows; });
        readStore('promoFacts', rows => { snapshot.promoFacts = rows; });
        readStore('tvFacts', rows => { snapshot.tvFacts = rows; });
        readStore('visitFacts', rows => { snapshot.visitFacts = rows; });
      };
    });

    try {
      await read;
      await done;
      return snapshot;
    } catch (error) {
      try { tx.abort(); } catch { /* transaction may already have completed */ }
      throw error;
    }
  }
}
