import { UnifiedImportService, type ImportSourceType, type UnifiedImportReport } from './unifiedImportService';

export interface ImportBundleSource {
  sourceType: ImportSourceType;
  rows: readonly unknown[];
}
export interface ImportBundleRequest {
  projectId: string;
  sources: readonly ImportBundleSource[];
  batchId?: string;
}
export interface ImportBundlePreview {
  projectId: string;
  batchId: string;
  sourceCount: number;
  totalRows: number;
  sources: Array<{ sourceType: ImportSourceType; rows: number }>;
  errors: string[];
  valid: boolean;
}
export interface ImportBundleResult {
  batchId: string;
  projectId: string;
  status: 'completed' | 'partial' | 'failed';
  completedSources: ImportSourceType[];
  failedSource?: ImportSourceType;
  reports: UnifiedImportReport[];
  error?: string;
  atomicity: 'per-source-only';
}

const KNOWN: readonly ImportSourceType[] = ['sales', 'market', 'promo', 'tv', 'visits'];

/**
 * Coordinates multi-file import, but deliberately does not claim cross-source atomicity.
 * Each source is published by its own existing IndexedDB transaction. On failure, the report
 * identifies already-published sources so the UI can explain the partial outcome and offer retry.
 */
export class ImportBundleService {
  constructor(private readonly imports = new UnifiedImportService()) {}

  preview(input: ImportBundleRequest): ImportBundlePreview {
    const errors: string[] = [];
    const batchId = input.batchId ?? crypto.randomUUID();
    if (!input.projectId.trim()) errors.push('Необходимо выбрать проект.');
    if (!input.sources.length) errors.push('Добавьте хотя бы один источник данных.');
    const seen = new Set<ImportSourceType>();
    for (const source of input.sources) {
      if (!KNOWN.includes(source.sourceType)) errors.push(`Неизвестный источник: ${String(source.sourceType)}.`);
      if (seen.has(source.sourceType)) errors.push(`Источник ${source.sourceType} добавлен более одного раза.`);
      seen.add(source.sourceType);
      if (!Array.isArray(source.rows) || source.rows.length === 0) errors.push(`Источник ${source.sourceType} не содержит строк.`);
    }
    return {
      projectId: input.projectId,
      batchId,
      sourceCount: input.sources.length,
      totalRows: input.sources.reduce((sum, source) => sum + source.rows.length, 0),
      sources: input.sources.map(source => ({ sourceType: source.sourceType, rows: source.rows.length })),
      errors,
      valid: errors.length === 0,
    };
  }

  async commit(input: ImportBundleRequest): Promise<ImportBundleResult> {
    const preview = this.preview(input);
    if (!preview.valid) {
      return { batchId: preview.batchId, projectId: input.projectId, status: 'failed', completedSources: [], reports: [], error: preview.errors.join(' '), atomicity: 'per-source-only' };
    }
    const reports: UnifiedImportReport[] = [];
    const completedSources: ImportSourceType[] = [];
    for (const source of input.sources) {
      try {
        const report = await this.imports.importSource({
          projectId: input.projectId,
          sourceType: source.sourceType,
          rows: source.rows,
          sourceBatchId: `${preview.batchId}:${source.sourceType}`,
        });
        reports.push(report);
        completedSources.push(source.sourceType);
      } catch (error) {
        return {
          batchId: preview.batchId,
          projectId: input.projectId,
          status: completedSources.length ? 'partial' : 'failed',
          completedSources,
          failedSource: source.sourceType,
          reports,
          error: error instanceof Error ? error.message : String(error),
          atomicity: 'per-source-only',
        };
      }
    }
    return { batchId: preview.batchId, projectId: input.projectId, status: 'completed', completedSources, reports, atomicity: 'per-source-only' };
  }
}
