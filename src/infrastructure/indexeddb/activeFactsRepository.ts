import { openPharmaDatabase } from './database';
import { transactionDone } from './transaction';
import type { FactStoreName, VersionedFact } from '../../application/contracts/versionedFacts';

/**
 * Version-aware read path. Pointer lookup and fact lookup happen in one readonly transaction,
 * so a query sees either the old or new active pointer, never a mixture of versions.
 * Legacy facts without datasetVersion are deliberately not returned by this API.
 */
export class ActiveFactsRepository<T extends VersionedFact> {
  constructor(private readonly storeName: FactStoreName) {}

  async getForProject(projectId: string): Promise<T[]> {
    if (!projectId.trim()) throw new Error('projectId обязателен.');
    const db = await openPharmaDatabase();
    const tx = db.transaction(['projects', this.storeName], 'readonly');
    const done = transactionDone(tx);
    const projectRequest = tx.objectStore('projects').get(projectId);
    let result: T[] = [];
    projectRequest.onsuccess = () => {
      const project = projectRequest.result as { activeDatasetVersion?: string } | undefined;
      if (!project?.activeDatasetVersion) return;
      const request = tx.objectStore(this.storeName).index('projectId_datasetVersion')
        .getAll(IDBKeyRange.only([projectId, project.activeDatasetVersion]));
      request.onsuccess = () => { result = request.result as T[]; };
      request.onerror = () => { try { tx.abort(); } catch { /* transactionDone reports the failure */ } };
    };
    projectRequest.onerror = () => { try { tx.abort(); } catch { /* transactionDone reports the failure */ } };
    await done;
    return result;
  }
}
