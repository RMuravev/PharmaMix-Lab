/** IndexedDB schema for the modular PharmaMix Lab architecture. */
export const PHARMA_DB_NAME = 'PharmaMixLabDB_v3';
export const PHARMA_DB_VERSION = 8;

export const LEGACY_STORES = ['sales', 'promos', 'tv', 'visits', 'market', 'meta'] as const;
export const STORES = [
  ...LEGACY_STORES,
  'projects', 'datasets', 'importBatches', 'salesFacts', 'marketFacts',
  'promoFacts', 'tvFacts', 'visitFacts', 'dimensions', 'aggregates',
  'calculationJobs', 'modelRuns', 'modelResults', 'scenarioResults', 'appMeta', 'importStaging', 'datasetVersions', 'analysisRegistry', 'eventStudyDiagnostics',
] as const;

export type LegacyStoreName = typeof LEGACY_STORES[number];
export type StoreName = typeof STORES[number];

export interface PersistedEntity {
  id: string;
  projectId?: string;
  createdAt: string;
  updatedAt?: string;
  schemaVersion: number;
}

export interface AggregateRecord extends PersistedEntity {
  aggregateType: string;
  cacheKey: string;
  datasetVersion: string;
  algorithmVersion: string;
  dimensions: Record<string, string | number>;
  metrics: Record<string, number | null>;
  series?: Record<string, unknown>;
  status: 'ready' | 'stale';
  generatedAt: string;
}

export interface CalculationJob extends PersistedEntity {
  jobType: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  datasetVersion: string;
  params: Record<string, unknown>;
  startedAt?: string;
  finishedAt?: string;
  error?: { code: string; message: string };
}
