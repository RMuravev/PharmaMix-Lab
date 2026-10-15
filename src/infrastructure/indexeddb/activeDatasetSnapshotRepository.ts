import { openPharmaDatabase } from './database';
import { transactionDone } from './transaction';
import type { FactStoreName, VersionedFact } from '../../application/contracts/versionedFacts';

export interface ActiveDatasetSnapshot {
  projectId: string;
  datasetVersion: string | null;
  legacy: boolean;
  salesFacts: VersionedFact[];
  marketFacts: VersionedFact[];
  promoFacts: VersionedFact[];
  tvFacts: VersionedFact[];
  visitFacts: VersionedFact[];
  rowCounts: Record<FactStoreName, number>;
}

const FACT_STORES: readonly FactStoreName[] = [
  'salesFacts', 'marketFacts', 'promoFacts', 'tvFacts', 'visitFacts',
];

/**
 * Reads the active pointer and all five fact stores in one readonly transaction.
 * This is the common consistency boundary for dashboards and analytics queries.
 * Legacy mode only returns unversioned rows (or explicitly marked 'legacy' rows),
 * preventing orphaned versioned facts from leaking in when a project pointer is absent.
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
      legacy: true,
      salesFacts: [], marketFacts: [], promoFacts: [], tvFacts: [], visitFacts: [],
      rowCounts: { salesFacts: 0, marketFacts: 0, promoFacts: 0, tvFacts: 0, visitFacts: 0 },
    };

    const read = new Promise<void>((resolve, reject) => {
      const projectRequest = tx.objectStore('projects').get(projectId);
      projectRequest.onerror = () => reject(projectRequest.error ?? new Error('Не удалось прочитать проект.'));
      projectRequest.onsuccess = () => {
        const project = projectRequest.result as { activeDatasetVersion?: string } | undefined;
        const version = project?.activeDatasetVersion;
        snapshot.legacy = !version;
        snapshot.datasetVersion = version ?? null;
        let remaining = FACT_STORES.length;
        for (const storeName of FACT_STORES) {
          // Legacy projects have no active pointer. Read only rows belonging to this project
          // from the old fact stores; never combine them with rows from a versioned snapshot.
          const store = tx.objectStore(storeName);
          const request = version
            ? store.index('projectId_datasetVersion').getAll(IDBKeyRange.only([projectId, version]))
            : store.index('projectId').getAll(IDBKeyRange.only(projectId));
          request.onerror = () => reject(request.error ?? new Error(`Не удалось прочитать ${storeName}${version ? ' активной версии' : ' legacy-проекта'}.`));
          request.onsuccess = () => {
            const fetched = request.result as VersionedFact[];
            // A missing pointer means legacy mode. Exclude rows that carry a version so
            // orphaned/stale versioned facts can never leak into the legacy snapshot.
            const rows = version ? fetched : fetched.filter((row) => !row.datasetVersion || row.datasetVersion === 'legacy');
            (snapshot[storeName] as VersionedFact[]) = rows;
            snapshot.rowCounts[storeName] = rows.length;
            remaining -= 1;
            if (remaining === 0) resolve();
          };
        }
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
