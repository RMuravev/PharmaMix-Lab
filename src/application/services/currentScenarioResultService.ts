import { openPharmaDatabase } from '../../infrastructure/indexeddb/database';
import { requestResult, transactionDone } from '../../infrastructure/indexeddb/transaction';
import { classifyModelFreshness, type ModelFreshnessStatus } from './modelRunFreshnessService';

export interface ScenarioResultRecord {
  id: string;
  projectId: string;
  scenarioId: string;
  datasetVersion?: string | null;
  createdAt?: string;
  payload?: unknown;
  [key: string]: unknown;
}

export interface ScenarioResultWithFreshness {
  result: ScenarioResultRecord;
  freshness: ModelFreshnessStatus;
  reason: string;
}

export class ScenarioResultNotCurrentError extends Error {
  readonly code = 'SCENARIO_RESULT_NOT_CURRENT';
  constructor(message: string) {
    super(message);
    this.name = 'ScenarioResultNotCurrentError';
  }
}

/**
 * Safe scenario-result read path. The scenario result and active project version are read
 * within one readonly transaction so consumers can explicitly reject stale outputs.
 */
export class CurrentScenarioResultService {
  async getCurrentResult(projectId: string, resultId: string): Promise<ScenarioResultRecord> {
    if (!projectId.trim()) throw new Error('projectId обязателен.');
    if (!resultId.trim()) throw new Error('resultId обязателен.');

    const db = await openPharmaDatabase();
    const tx = db.transaction(['projects', 'scenarioResults'], 'readonly');
    const done = transactionDone(tx);
    const projectPromise = requestResult(tx.objectStore('projects').get(projectId));
    const resultPromise = requestResult(tx.objectStore('scenarioResults').get(resultId));
    const [project, rawResult] = await Promise.all([projectPromise, resultPromise]);
    await done;

    const result = rawResult as ScenarioResultRecord | undefined;
    if (!result || result.projectId !== projectId) {
      throw new ScenarioResultNotCurrentError('Результат сценария не найден в указанном проекте.');
    }
    const activeVersion = (project as { activeDatasetVersion?: string | null } | undefined)?.activeDatasetVersion ?? null;
    const classification = classifyModelFreshness(result.datasetVersion, activeVersion);
    if (classification.freshness !== 'fresh') {
      throw new ScenarioResultNotCurrentError(`Результат сценария нельзя использовать как актуальный. ${classification.reason}`);
    }
    return result;
  }

  async listForProject(projectId: string): Promise<ScenarioResultWithFreshness[]> {
    if (!projectId.trim()) throw new Error('projectId обязателен.');
    const db = await openPharmaDatabase();
    const tx = db.transaction(['projects', 'scenarioResults'], 'readonly');
    const done = transactionDone(tx);
    const projectPromise = requestResult(tx.objectStore('projects').get(projectId));
    const resultsPromise = requestResult(tx.objectStore('scenarioResults').index('projectId').getAll(projectId));
    const [project, rawResults] = await Promise.all([projectPromise, resultsPromise]);
    await done;
    const activeVersion = (project as { activeDatasetVersion?: string | null } | undefined)?.activeDatasetVersion ?? null;
    return (rawResults as ScenarioResultRecord[]).map(result => ({
      result,
      ...classifyModelFreshness(result.datasetVersion, activeVersion),
    })).sort((a, b) => (b.result.createdAt ?? '').localeCompare(a.result.createdAt ?? ''));
  }
}
