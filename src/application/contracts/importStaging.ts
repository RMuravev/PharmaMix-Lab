import type { ImportSourceType } from '../services/unifiedImportService';

export type StagingStatus = 'staged' | 'publishing' | 'published' | 'partially-published' | 'failed' | 'discarded';
export interface StagedSource {
  sourceType: ImportSourceType;
  rows: readonly unknown[];
}
export interface StagingBatchRequest {
  projectId: string;
  sources: readonly StagedSource[];
  batchId?: string;
}
export interface StagingBatchRecord {
  id: string;
  batchId: string;
  projectId: string;
  sourceType: ImportSourceType;
  rowIndex: number;
  row: unknown;
  status: StagingStatus;
  createdAt: string;
  schemaVersion: number;
}
export interface StagingPreview {
  batchId: string;
  projectId: string;
  sourceCount: number;
  totalRows: number;
  sources: Array<{ sourceType: ImportSourceType; rowCount: number }>;
  errors: string[];
  valid: boolean;
}
