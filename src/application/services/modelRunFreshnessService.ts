import { openPharmaDatabase } from '../../infrastructure/indexeddb/database';
import { requestResult, transactionDone } from '../../infrastructure/indexeddb/transaction';

export type ModelFreshnessStatus = 'fresh' | 'stale' | 'legacy' | 'unverifiable';

export interface ModelRunRecord {
  id: string;
  projectId: string;
  modelType?: string;
  datasetVersion?: string | null;
  status?: string;
  createdAt?: string;
  [key: string]: unknown;
}

export interface ModelResultRecord {
  id: string;
  projectId: string;
  runId?: string;
  datasetVersion?: string | null;
  resultType?: string;
  [key: string]: unknown;
}

export interface ModelRunWithFreshness {
  run: ModelRunRecord;
  freshness: ModelFreshnessStatus;
  results: ModelResultRecord[];
  reason: string;
}

export function classifyModelFreshness(
  runVersion: string | null | undefined,
  activeVersion: string | null | undefined,
): { freshness: ModelFreshnessStatus; reason: string } {
  if (!runVersion) {
    return { freshness: 'legacy', reason: 'У запуска не зафиксирована версия исходного набора данных.' };
  }
  if (!activeVersion) {
    return { freshness: 'unverifiable', reason: 'У проекта нет активной версии набора данных для сравнения.' };
  }
  if (runVersion !== activeVersion) {
    return { freshness: 'stale', reason: `Результат рассчитан на версии ${runVersion}, активна версия ${activeVersion}.` };
  }
  return { freshness: 'fresh', reason: 'Версия исходных данных совпадает с активной.' };
}

/**
 * Reads model runs and their results together with the project's active dataset pointer.
 * Consumers should not present stale/legacy results as current without an explicit label.
 */
export class ModelRunFreshnessService {
  async listForProject(projectId: string): Promise<ModelRunWithFreshness[]> {
    if (!projectId.trim()) throw new Error('projectId обязателен.');
    const db = await openPharmaDatabase();
    const tx = db.transaction(['projects', 'modelRuns', 'modelResults'], 'readonly');
    const done = transactionDone(tx);
    const projectRequest = requestResult(tx.objectStore('projects').get(projectId));
    const runsRequest = requestResult(tx.objectStore('modelRuns').index('projectId').getAll(projectId));
    const resultsRequest = requestResult(tx.objectStore('modelResults').index('projectId').getAll(projectId));
    const [project, runs, results] = await Promise.all([projectRequest, runsRequest, resultsRequest]);
    await done;

    const activeVersion = (project as { activeDatasetVersion?: string } | undefined)?.activeDatasetVersion ?? null;
    const resultsByRun = new Map<string, ModelResultRecord[]>();
    for (const raw of results as ModelResultRecord[]) {
      if (!raw.runId) continue;
      const bucket = resultsByRun.get(raw.runId) ?? [];
      bucket.push(raw);
      resultsByRun.set(raw.runId, bucket);
    }

    return (runs as ModelRunRecord[])
      .map((run) => {
        const classification = classifyModelFreshness(run.datasetVersion, activeVersion);
        return {
          run,
          ...classification,
          results: resultsByRun.get(run.id) ?? [],
        };
      })
      .sort((a, b) => (b.run.createdAt ?? '').localeCompare(a.run.createdAt ?? ''));
  }
}
