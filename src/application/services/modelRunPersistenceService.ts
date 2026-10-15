import { openPharmaDatabase } from '../../infrastructure/indexeddb/database';
import { transactionDone } from '../../infrastructure/indexeddb/transaction';

export interface ModelResultInput {
  resultType: string;
  payload: unknown;
}

export interface PersistModelRunInput {
  projectId: string;
  modelType: string;
  parameters?: Record<string, unknown>;
  algorithmVersion: string;
  results: ModelResultInput[];
  /** Optional optimistic guard: fail if the active dataset changed since calculation started. */
  expectedDatasetVersion?: string;
}

export interface PersistedModelRunSummary {
  runId: string;
  datasetVersion: string;
  resultCount: number;
  createdAt: string;
}

export function assertExpectedDatasetVersion(expected: string | undefined, active: string): void {
  if (expected && expected !== active) {
    throw new Error(`Версия данных изменилась во время расчёта: ожидалась ${expected}, активна ${active}. Перезапустите расчёт.`);
  }
}

function makeId(prefix: string): string {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}

/**
 * Persists a model run and all of its results atomically, binding them to the active dataset version.
 * The active version is read inside the same read-write transaction that writes the run/results.
 */
export class ModelRunPersistenceService {
  async persist(input: PersistModelRunInput): Promise<PersistedModelRunSummary> {
    if (!input.projectId.trim()) throw new Error('projectId обязателен.');
    if (!input.modelType.trim()) throw new Error('modelType обязателен.');
    if (!input.algorithmVersion.trim()) throw new Error('algorithmVersion обязателен.');
    if (input.results.length === 0) throw new Error('Нельзя сохранить запуск без результатов.');
    if (input.results.some((result) => !result.resultType.trim())) throw new Error('У каждого результата должен быть указан resultType.');

    const db = await openPharmaDatabase();
    const tx = db.transaction(['projects', 'modelRuns', 'modelResults'], 'readwrite');
    const done = transactionDone(tx);
    const runId = makeId('run');
    const createdAt = new Date().toISOString();
    let summary: PersistedModelRunSummary | undefined;
    const projectRequest = tx.objectStore('projects').get(input.projectId);

    projectRequest.onsuccess = () => {
      const project = projectRequest.result as { activeDatasetVersion?: string | null } | undefined;
      const activeVersion = project?.activeDatasetVersion;
      if (!project) {
        tx.abort();
        return;
      }
      if (!activeVersion) {
        tx.abort();
        return;
      }
      try { assertExpectedDatasetVersion(input.expectedDatasetVersion, activeVersion); }
      catch { tx.abort(); return; }

      tx.objectStore('modelRuns').add({
        id: runId,
        projectId: input.projectId,
        modelType: input.modelType,
        datasetVersion: activeVersion,
        algorithmVersion: input.algorithmVersion,
        parameters: input.parameters ?? {},
        status: 'succeeded',
        createdAt,
        updatedAt: createdAt,
        schemaVersion: 1,
      });
      input.results.forEach((result) => tx.objectStore('modelResults').add({
        id: makeId('result'),
        projectId: input.projectId,
        runId,
        datasetVersion: activeVersion,
        resultType: result.resultType,
        payload: result.payload,
        createdAt,
        schemaVersion: 1,
      }));
      summary = { runId, datasetVersion: activeVersion, resultCount: input.results.length, createdAt };
    };

    try {
      await done;
    } catch (error) {
      const project = await new Promise<{ activeDatasetVersion?: string | null } | undefined>((resolve) => {
        const readTx = db.transaction(['projects'], 'readonly');
        const request = readTx.objectStore('projects').get(input.projectId);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(undefined);
      });
      if (!project) throw new Error(`Проект «${input.projectId}» не найден; запуск не сохранён.`);
      if (!project.activeDatasetVersion) throw new Error('Нет активной версии набора данных; сначала опубликуйте набор данных.');
      if (input.expectedDatasetVersion && project.activeDatasetVersion !== input.expectedDatasetVersion) {
        assertExpectedDatasetVersion(input.expectedDatasetVersion, project.activeDatasetVersion);
      }
      throw error;
    }
    if (!summary) throw new Error('Запуск не был сохранён: активная версия набора данных не определена.');
    return summary;
  }
}
