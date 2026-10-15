import { openPharmaDatabase } from '../../infrastructure/indexeddb/database';
import { transactionDone } from '../../infrastructure/indexeddb/transaction';
import type { DatasetPublication, DatasetPublicationStatus, ProjectDatasetPointer } from '../contracts/datasetPublication';

const SOURCES = ['sales', 'market', 'promo', 'tv', 'visits'];

/**
 * Coordinates dataset-version lifecycle and atomically switches the project's active-version pointer.
 * Fact stores must include datasetVersion and all reads must filter by the pointer before this service
 * can be used as an end-to-end atomic import. This service intentionally does not claim that yet.
 */
export class DatasetPublicationService {
  async create(projectId: string, expectedSources: string[] = [...SOURCES]): Promise<DatasetPublication> {
    if (!projectId.trim()) throw new Error('projectId обязателен.');
    if (!expectedSources.length || expectedSources.some(source => !SOURCES.includes(source))) {
      throw new Error('Укажите хотя бы один корректный источник данных.');
    }
    const db = await openPharmaDatabase();
    const tx = db.transaction(['projects', 'datasetVersions'], 'readwrite');
    const done = transactionDone(tx);
    const projects = tx.objectStore('projects');
    const versions = tx.objectStore('datasetVersions');
    const getProject = projects.get(projectId);
    let created: DatasetPublication | undefined;
    getProject.onsuccess = () => {
      const project = getProject.result as (ProjectDatasetPointer & { id: string }) | undefined;
      const getVersions = versions.index('projectId').getAll(projectId);
      getVersions.onsuccess = () => {
        const all = getVersions.result as DatasetPublication[];
        const version = all.reduce((max, row) => Math.max(max, row.version), 0) + 1;
        const now = new Date().toISOString();
        created = {
          id: `${projectId}:dataset:${version}:${crypto.randomUUID()}`,
          projectId, version, status: 'building', sourceVersions: {},
          expectedSources: [...new Set(expectedSources)], preparedSources: [], createdAt: now, updatedAt: now,
        };
        versions.put(created);
        if (!project) projects.put({ id: projectId, createdAt: now, updatedAt: now, schemaVersion: 1 });
      };
      getVersions.onerror = () => { try { tx.abort(); } catch { /* transactionDone reports failure */ } };
    };
    getProject.onerror = () => { try { tx.abort(); } catch { /* transactionDone reports failure */ } };
    await done;
    if (!created) throw new Error('Не удалось создать версию набора данных.');
    return created;
  }

  async markSourcePrepared(versionId: string, source: string, sourceVersion: number): Promise<DatasetPublication> {
    if (!SOURCES.includes(source) || !Number.isInteger(sourceVersion) || sourceVersion < 0) {
      throw new Error('Некорректный источник или номер версии источника.');
    }
    return this.updateVersion(versionId, row => {
      if (row.status !== 'building') throw new Error('Источники можно добавлять только в собирающуюся версию.');
      if (!row.expectedSources.includes(source)) throw new Error(`Источник ${source} не входит в состав версии.`);
      row.sourceVersions = { ...row.sourceVersions, [source]: sourceVersion };
      row.preparedSources = [...new Set([...row.preparedSources, source])];
      if (row.expectedSources.every(item => row.preparedSources.includes(item))) row.status = 'ready';
      return row;
    });
  }

  async markFailed(versionId: string, reason: string): Promise<DatasetPublication> {
    return this.updateVersion(versionId, row => {
      if (row.status === 'active' || row.status === 'superseded') throw new Error('Опубликованную версию нельзя пометить как failed.');
      row.status = 'failed'; row.error = reason.slice(0, 2000); return row;
    });
  }

  async activate(versionId: string): Promise<DatasetPublication> {
    const db = await openPharmaDatabase();
    const tx = db.transaction(['projects', 'datasetVersions'], 'readwrite');
    const done = transactionDone(tx);
    const versions = tx.objectStore('datasetVersions');
    const targetRequest = versions.get(versionId);
    let activated: DatasetPublication | undefined;
    targetRequest.onsuccess = () => {
      const target = targetRequest.result as DatasetPublication | undefined;
      if (!target) { try { tx.abort(); } catch { /* handled by done */ } return; }
      if (target.status !== 'ready') { try { tx.abort(); } catch { /* handled by done */ } return; }
      const projectRequest = tx.objectStore('projects').get(target.projectId);
      projectRequest.onsuccess = () => {
        const project = (projectRequest.result ?? { id: target.projectId, schemaVersion: 1 }) as ProjectDatasetPointer;
        const now = new Date().toISOString();
        const currentId = project.activeDatasetVersion;
        const writeTarget: DatasetPublication = { ...target, status: 'active', updatedAt: now, activatedAt: now };
        versions.put(writeTarget);
        project.activeDatasetVersion = target.id;
        project.updatedAt = now;
        tx.objectStore('projects').put(project);
        activated = writeTarget;
        if (currentId && currentId !== target.id) {
          const oldRequest = versions.get(currentId);
          oldRequest.onsuccess = () => {
            const old = oldRequest.result as DatasetPublication | undefined;
            if (old?.status === 'active') versions.put({ ...old, status: 'superseded', updatedAt: now });
          };
        }
      };
      projectRequest.onerror = () => { try { tx.abort(); } catch { /* handled by done */ } };
    };
    targetRequest.onerror = () => { try { tx.abort(); } catch { /* handled by done */ } };
    try { await done; } catch (error) {
      if (!targetRequest.result) throw new Error('Версия набора данных не найдена.');
      if ((targetRequest.result as DatasetPublication).status !== 'ready') throw new Error('Активировать можно только полностью подготовленную версию.');
      throw error;
    }
    if (!activated) throw new Error('Не удалось переключить активную версию.');
    return activated;
  }

  async getActive(projectId: string): Promise<DatasetPublication | undefined> {
    const db = await openPharmaDatabase();
    const tx = db.transaction(['projects', 'datasetVersions'], 'readonly');
    const done = transactionDone(tx);
    const projectRequest = tx.objectStore('projects').get(projectId);
    let active: DatasetPublication | undefined;
    projectRequest.onsuccess = () => {
      const project = projectRequest.result as ProjectDatasetPointer | undefined;
      if (!project?.activeDatasetVersion) return;
      const versionRequest = tx.objectStore('datasetVersions').get(project.activeDatasetVersion);
      versionRequest.onsuccess = () => { active = versionRequest.result as DatasetPublication | undefined; };
    };
    await done;
    return active;
  }

  private async updateVersion(id: string, update: (row: DatasetPublication) => DatasetPublication): Promise<DatasetPublication> {
    const db = await openPharmaDatabase();
    const tx = db.transaction('datasetVersions', 'readwrite');
    const done = transactionDone(tx);
    const store = tx.objectStore('datasetVersions');
    const request = store.get(id);
    let updated: DatasetPublication | undefined;
    request.onsuccess = () => {
      const row = request.result as DatasetPublication | undefined;
      if (!row) { try { tx.abort(); } catch { /* handled by done */ } return; }
      try {
        updated = { ...update(row), updatedAt: new Date().toISOString() };
        store.put(updated);
      } catch { try { tx.abort(); } catch { /* handled by done */ } }
    };
    request.onerror = () => { try { tx.abort(); } catch { /* handled by done */ } };
    await done;
    if (!updated) throw new Error('Не удалось обновить версию набора данных.');
    return updated;
  }
}

export type { DatasetPublicationStatus };
