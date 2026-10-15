import { openPharmaDatabase } from '../../infrastructure/indexeddb/database';
import { requestResult, transactionDone } from '../../infrastructure/indexeddb/transaction';
import { classifyModelFreshness, type ModelResultRecord, type ModelRunRecord } from './modelRunFreshnessService';
import { assertCurrentAnalysis } from './analysisProvenanceService';

export class ModelResultNotCurrentError extends Error {
  readonly code = 'MODEL_RESULT_NOT_CURRENT';
  constructor(message: string) {
    super(message);
    this.name = 'ModelResultNotCurrentError';
  }
}

export interface CurrentModelResultBundle {
  run: ModelRunRecord;
  results: ModelResultRecord[];
  datasetVersion: string;
}

/**
 * Safe read path for consumers that require current model output. Unlike the history screen,
 * this service rejects legacy, unverifiable, stale, or internally inconsistent result bundles.
 */
export class CurrentModelResultService {
  async getCurrentResults(projectId: string, runId: string): Promise<CurrentModelResultBundle> {
    if (!projectId.trim()) throw new Error('projectId обязателен.');
    if (!runId.trim()) throw new Error('runId обязателен.');

    const db = await openPharmaDatabase();
    const tx = db.transaction(['projects', 'modelRuns', 'modelResults'], 'readonly');
    const done = transactionDone(tx);
    const projectPromise = requestResult(tx.objectStore('projects').get(projectId));
    const runPromise = requestResult(tx.objectStore('modelRuns').get(runId));
    const resultsPromise = requestResult(tx.objectStore('modelResults').index('runId').getAll(runId));
    const [project, rawRun, rawResults] = await Promise.all([projectPromise, runPromise, resultsPromise]);
    await done;

    const run = rawRun as ModelRunRecord | undefined;
    if (!run || run.projectId !== projectId) throw new ModelResultNotCurrentError('Запуск модели не найден в указанном проекте.');
    const activeVersion = (project as { activeDatasetVersion?: string | null } | undefined)?.activeDatasetVersion ?? null;
    const classification = classifyModelFreshness(run.datasetVersion, activeVersion);
    if (classification.freshness !== 'fresh' || !activeVersion) {
      throw new ModelResultNotCurrentError(`Результат нельзя использовать как актуальный. ${classification.reason}`);
    }
    assertCurrentAnalysis({ projectId: run.projectId, datasetVersion: run.datasetVersion, algorithmVersion: typeof run.algorithmVersion === 'string' ? run.algorithmVersion : null, createdAt: run.createdAt }, projectId, activeVersion);

    const results = (rawResults as ModelResultRecord[]).filter(result => result.projectId === projectId);
    if (results.length === 0) throw new ModelResultNotCurrentError('У запуска нет сохранённых результатов.');
    const inconsistent = results.find(result => result.datasetVersion !== run.datasetVersion);
    if (inconsistent) {
      throw new ModelResultNotCurrentError(`Версия результата ${inconsistent.id} не совпадает с версией запуска. Результат заблокирован.`);
    }
    return { run, results, datasetVersion: activeVersion };
  }
}
