import type { LegacyStoreName } from '../../infrastructure/indexeddb/schema';
export interface ImportPreview {
  batchId: string;
  sourceFormat: 'legacy-dump' | 'csv-bundle';
  partitions: Partial<Record<LegacyStoreName, number>>;
  totalRows: number;
  warnings: string[];
  errors: string[];
  valid: boolean;
}
export interface ImportPayload {
  batchId: string;
  projectId: string;
  partitions: Partial<Record<LegacyStoreName, unknown[]>>;
  sourceFormat: ImportPreview['sourceFormat'];
  createdAt: string;
}
export interface ImportResult { success: boolean; batchId: string; rowsImported: number; message: string; }
