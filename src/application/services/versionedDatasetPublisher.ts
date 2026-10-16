import { openPharmaDatabase } from '../../infrastructure/indexeddb/database';
import { transactionDone } from '../../infrastructure/indexeddb/transaction';
import type { FactStoreName, VersionedFact } from '../contracts/versionedFacts';
import type { SourceAvailabilityMap } from '../contracts/sourceAvailability';

/** A publication is a complete snapshot: every source must be supplied explicitly.
 * Use [] when a source is intentionally empty; omission is rejected to avoid silently
 * replacing a previously populated source with no rows.
 */
export type VersionedDatasetInput = Record<FactStoreName, readonly VersionedFact[]>;
export interface VersionedDatasetPublishResult {
  projectId: string;
  datasetVersion: string;
  publishedAt: string;
  rowCounts: Partial<Record<FactStoreName, number>>;
}

const FACT_STORES: FactStoreName[] = ['salesFacts', 'marketFacts', 'promoFacts', 'tvFacts', 'visitFacts'];

/**
 * Writes all supplied source facts under a fresh version and switches the project's
 * active pointer in the same IndexedDB transaction. Readers using ActiveFactsRepository
 * therefore observe either the old version or the new one, never a partially published set.
 * This is the only supported publication path for the current application.
 */
export class VersionedDatasetPublisher {
  async publish(projectId: string, input: VersionedDatasetInput, metadata?:{sourceAvailability:SourceAvailabilityMap}): Promise<VersionedDatasetPublishResult> {
    if (!projectId.trim()) throw new Error('projectId обязателен.');
    const rowCounts: Partial<Record<FactStoreName, number>> = {};
    let totalRows = 0;
    for (const storeName of FACT_STORES) {
      if (!Object.prototype.hasOwnProperty.call(input, storeName) || !Array.isArray(input[storeName])) {
        throw new Error(`Полный снимок должен явно содержать источник ${storeName} (пустой источник передавайте как []).`);
      }
      const rows = input[storeName];
      rowCounts[storeName] = rows.length;
      totalRows += rows.length;
      const seenIds = new Set<string>();
      for (const row of rows) {
        if (!row.id || row.projectId !== projectId) throw new Error(`Некорректная запись в ${storeName}: id и совпадающий projectId обязательны.`);
        if (seenIds.has(row.id)) throw new Error(`Дублирующийся id ${row.id} в источнике ${storeName}.`);
        seenIds.add(row.id);
      }
    }
    if (totalRows === 0) throw new Error('Нельзя опубликовать пустой набор данных.');

    const db = await openPharmaDatabase();
    const tx = db.transaction(['projects', 'datasetVersions', ...FACT_STORES, 'aggregates'], 'readwrite');
    const done = transactionDone(tx);
    const projects = tx.objectStore('projects');
    const projectRequest = projects.get(projectId);
    const publishedAt = new Date().toISOString();
    const datasetVersion = `${projectId}:dataset:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    let didScheduleWrites = false;
    let operationError: unknown;

    projectRequest.onsuccess = () => {
      try {
        const existingProject = (projectRequest.result as Record<string, unknown> | undefined) ?? {
          id: projectId, createdAt: publishedAt, schemaVersion: 1,
        };

        for (const storeName of FACT_STORES) {
          const store = tx.objectStore(storeName);
          for (const row of input[storeName] ?? []) {
            // IDs are version-scoped so old facts remain available for rollback/audit.
            store.put({ ...row, id: `${datasetVersion}:${storeName}:${row.id}`, projectId, datasetVersion });
          }
        }
        const versions = tx.objectStore('datasetVersions');
        const versionCursorRequest = versions.index('projectId').openCursor(IDBKeyRange.only(projectId));
        versionCursorRequest.onsuccess = () => {
          const cursor = versionCursorRequest.result;
          if (!cursor) return;
          const previous = cursor.value as { id: string; status?: string; updatedAt?: string };
          if (previous.status === 'active') cursor.update({ ...previous, status: 'superseded', updatedAt: publishedAt });
          cursor.continue();
        };
        versionCursorRequest.onerror = () => { try { tx.abort(); } catch { /* transactionDone reports the error */ } };
        versions.put({
          id: datasetVersion, projectId, version: datasetVersion, status: 'active',
          createdAt: publishedAt, updatedAt: publishedAt, publishedAt, schemaVersion: 1,
          rowCounts, totalRows,
          sourceAvailability:metadata?.sourceAvailability,
        });
        projects.put({ ...existingProject, activeDatasetVersion: datasetVersion, updatedAt: publishedAt });

        const aggregates = tx.objectStore('aggregates');
        const cursorRequest = aggregates.index('projectId').openCursor(IDBKeyRange.only(projectId));
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor) return;
          const value = cursor.value as { status?: string; updatedAt?: string };
          if (value.status === 'ready') cursor.update({ ...value, status: 'stale', updatedAt: publishedAt, staleReason: 'active-dataset-version-changed' });
          cursor.continue();
        };
        cursorRequest.onerror = () => { try { tx.abort(); } catch { /* transactionDone reports the error */ } };
        didScheduleWrites = true;
      } catch (error) {
        operationError = error;
        try { tx.abort(); } catch { /* transactionDone reports the error */ }
      }
    };
    projectRequest.onerror = () => { try { tx.abort(); } catch { /* transactionDone reports the error */ } };
    try {
      await done;
    } catch (error) {
      // Preserve domain-level errors (e.g. unknown project) instead of leaking a generic AbortError.
      if (operationError instanceof Error) throw operationError;
      throw error;
    }
    if (!didScheduleWrites) throw new Error('Публикация набора данных не выполнена.');
    return { projectId, datasetVersion, publishedAt, rowCounts };
  }

  /** Reactivates an already-published snapshot without rewriting its facts. */
  async activateExistingVersion(projectId: string, datasetVersion: string): Promise<void> {
    if (!projectId.trim() || !datasetVersion.trim()) throw new Error('projectId и datasetVersion обязательны.');
    const db = await openPharmaDatabase();
    const tx = db.transaction(['projects', 'datasetVersions', 'aggregates'], 'readwrite');
    const done = transactionDone(tx);
    const projects = tx.objectStore('projects');
    const versions = tx.objectStore('datasetVersions');
    const projectReq = projects.get(projectId);
    let scheduled = false;
    projectReq.onsuccess = () => {
      const project = projectReq.result as Record<string, unknown> | undefined;
      if (!project) { try { tx.abort(); } catch { /* handled by done */ } return; }
      const versionReq = versions.get(datasetVersion);
      versionReq.onsuccess = () => {
        const target = versionReq.result as { id: string; projectId: string; status?: string; publishedAt?: string } | undefined;
        if (!target || target.projectId !== projectId || target.status === 'building' || target.status === 'failed') {
          try { tx.abort(); } catch { /* handled by done */ }
          return;
        }
        const now = new Date().toISOString();
        const versionCursor = versions.index('projectId').openCursor(IDBKeyRange.only(projectId));
        versionCursor.onsuccess = () => {
          const cursor = versionCursor.result;
          if (!cursor) return;
          const value = cursor.value as { id: string; status?: string; publishedAt?: string };
          if (value.id === datasetVersion) cursor.update({ ...value, status: 'active', updatedAt: now, publishedAt: value['publishedAt'] ?? now });
          else if (value.status === 'active') cursor.update({ ...value, status: 'superseded', updatedAt: now });
          cursor.continue();
        };
        versionCursor.onerror = () => { try { tx.abort(); } catch { /* handled by done */ } };
        projects.put({ ...project, activeDatasetVersion: datasetVersion, updatedAt: now });
        const aggregateCursor = tx.objectStore('aggregates').index('projectId').openCursor(IDBKeyRange.only(projectId));
        aggregateCursor.onsuccess = () => {
          const cursor = aggregateCursor.result;
          if (!cursor) return;
          const aggregate = cursor.value as { status?: string };
          if (aggregate.status === 'ready') cursor.update({ ...aggregate, status: 'stale', staleReason: 'active-dataset-version-rollback', updatedAt: now });
          cursor.continue();
        };
        aggregateCursor.onerror = () => { try { tx.abort(); } catch { /* handled by done */ } };
        scheduled = true;
      };
      versionReq.onerror = () => { try { tx.abort(); } catch { /* handled by done */ } };
    };
    projectReq.onerror = () => { try { tx.abort(); } catch { /* handled by done */ } };
    await done;
    if (!scheduled) throw new Error(`Не удалось активировать версию ${datasetVersion}; проверьте проект и версию.`);
  }
}
