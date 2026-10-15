export interface PageRequest { offset?: number; limit?: number }
export interface PageResult<T> { rows: T[]; total: number; offset: number; limit: number }
export interface FilterSpec { projectId?: string; periodFrom?: string; periodTo?: string; brand?: string; region?: string; chain?: string; sku?: string }

export interface FactsRepository<T> {
  count(): Promise<number>;
  getPage(request?: PageRequest): Promise<PageResult<T>>;
  replaceAll(rows: readonly T[]): Promise<void>;
}

export interface AggregateQuery {
  projectId: string;
  aggregateType: string;
  cacheKey: string;
  datasetVersion: string;
  algorithmVersion: string;
}
export interface AggregateRepository<T> {
  get(query: AggregateQuery): Promise<T | undefined>;
  upsert(record: T): Promise<void>;
  markStale(projectId: string, aggregateTypes?: readonly string[]): Promise<number>;
}

export interface ImportPreview { sourceType: string; rowCount: number; warnings: string[]; errors: string[] }
export interface ImportService<TFile = File, TPreview = ImportPreview> {
  preview(file: TFile, sourceType: string): Promise<TPreview>;
  commit(file: TFile, sourceType: string, batchId: string): Promise<void>;
}
