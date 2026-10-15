import { openPharmaDatabase } from '../../infrastructure/indexeddb/database';
import { transactionDone } from '../../infrastructure/indexeddb/transaction';

export interface PersistScenarioResultInput {
  projectId: string;
  scenarioId: string;
  algorithmVersion: string;
  parameters?: Record<string, unknown>;
  payload: unknown;
  /** Version captured before calculation started. Required to prevent saving a result for a newer dataset than it used. */
  expectedDatasetVersion: string;
}

export interface PersistedScenarioResultSummary {
  resultId: string;
  scenarioId: string;
  datasetVersion: string;
  createdAt: string;
}

export function assertScenarioDatasetVersion(expected: string, active: string | null | undefined): asserts active is string {
  if (!expected.trim()) throw new Error('expectedDatasetVersion обязателен для сохранения сценария.');
  if (!active) throw new Error('Нет активной версии набора данных; сначала опубликуйте набор данных.');
  if (expected !== active) {
    throw new Error(`Версия данных изменилась во время расчёта сценария: ожидалась ${expected}, активна ${active}. Перезапустите сценарий.`);
  }
}

function makeId(): string {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `scenario-result-${random}`;
}

/** Saves a scenario result atomically and binds it to the dataset version used by the calculation. */
export class ScenarioResultPersistenceService {
  async persist(input: PersistScenarioResultInput): Promise<PersistedScenarioResultSummary> {
    if (!input.projectId.trim()) throw new Error('projectId обязателен.');
    if (!input.scenarioId.trim()) throw new Error('scenarioId обязателен.');
    if (!input.algorithmVersion.trim()) throw new Error('algorithmVersion обязателен.');
    if (!input.expectedDatasetVersion.trim()) throw new Error('expectedDatasetVersion обязателен для сохранения сценария.');

    const db = await openPharmaDatabase();
    const tx = db.transaction(['projects', 'scenarioResults'], 'readwrite');
    const done = transactionDone(tx);
    const resultId = makeId();
    const createdAt = new Date().toISOString();
    let summary: PersistedScenarioResultSummary | undefined;
    const projectRequest = tx.objectStore('projects').get(input.projectId);
    projectRequest.onsuccess = () => {
      const project = projectRequest.result as { activeDatasetVersion?: string | null } | undefined;
      if (!project) { tx.abort(); return; }
      try { assertScenarioDatasetVersion(input.expectedDatasetVersion, project.activeDatasetVersion); }
      catch { tx.abort(); return; }
      tx.objectStore('scenarioResults').add({
        id: resultId,
        projectId: input.projectId,
        scenarioId: input.scenarioId,
        datasetVersion: project.activeDatasetVersion,
        algorithmVersion: input.algorithmVersion,
        parameters: input.parameters ?? {},
        payload: input.payload,
        status: 'succeeded',
        createdAt,
        schemaVersion: 1,
      });
      summary = { resultId, scenarioId: input.scenarioId, datasetVersion: project.activeDatasetVersion!, createdAt };
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
      if (!project) throw new Error(`Проект «${input.projectId}» не найден; сценарий не сохранён.`);
      assertScenarioDatasetVersion(input.expectedDatasetVersion, project.activeDatasetVersion);
      throw error;
    }
    if (!summary) throw new Error('Сценарий не сохранён: активная версия набора данных не определена.');
    return summary;
  }
}
