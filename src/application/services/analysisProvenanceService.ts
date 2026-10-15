export type AnalysisFreshness = 'fresh' | 'stale' | 'unverifiable';

export interface AnalysisProvenance {
  projectId: string;
  datasetVersion?: string | null;
  algorithmVersion?: string | null;
  parameters?: unknown;
  createdAt?: string | null;
  coverage?: { observed: number; expected: number } | null;
}

export interface AnalysisProvenanceStatus {
  freshness: AnalysisFreshness;
  reason: string;
  coveragePct: number | null;
}

/** Fail-closed status for any analytical result shown against an active project snapshot. */
export function classifyAnalysisProvenance(result: AnalysisProvenance, activeProjectId: string, activeDatasetVersion: string | null): AnalysisProvenanceStatus {
  if (!result.projectId || result.projectId !== activeProjectId) return { freshness: 'unverifiable', reason: 'Результат принадлежит другому проекту.', coveragePct: null };
  if (!result.datasetVersion || !activeDatasetVersion) return { freshness: 'unverifiable', reason: 'Версия набора данных отсутствует или не опубликована.', coveragePct: null };
  if (result.datasetVersion !== activeDatasetVersion) return { freshness: 'stale', reason: `Результат рассчитан для ${result.datasetVersion}, активна ${activeDatasetVersion}.`, coveragePct: coverage(result.coverage) };
  if (!result.algorithmVersion || !result.createdAt || Number.isNaN(Date.parse(result.createdAt))) return { freshness: 'unverifiable', reason: 'Неполная provenance: нужны algorithmVersion и корректный createdAt.', coveragePct: coverage(result.coverage) };
  if (result.coverage && (!Number.isFinite(result.coverage.observed) || !Number.isFinite(result.coverage.expected) || result.coverage.observed < 0 || result.coverage.expected <= 0 || result.coverage.observed > result.coverage.expected)) return { freshness: 'unverifiable', reason: 'Некорректное покрытие результата.', coveragePct: null };
  return { freshness: 'fresh', reason: 'Версия данных совпадает; provenance проверена.', coveragePct: coverage(result.coverage) };
}

function coverage(value: AnalysisProvenance['coverage']): number | null {
  return value && value.expected > 0 && Number.isFinite(value.observed) && Number.isFinite(value.expected) ? Math.max(0, Math.min(100, value.observed / value.expected * 100)) : null;
}

export function assertCurrentAnalysis(result: AnalysisProvenance, activeProjectId: string, activeDatasetVersion: string | null): void {
  const status = classifyAnalysisProvenance(result, activeProjectId, activeDatasetVersion);
  if (status.freshness !== 'fresh') throw new Error(`Результат заблокирован: ${status.reason}`);
}
