import type { SalesNormalizationReport } from './salesNormalizationService';
import type { MarketNormalizationReport } from './marketNormalizationService';
import type { PromoNormalizationReport } from './promoNormalizationService';
import type { ExposureCommitReport } from './channelExposureNormalizationService';
import { SalesNormalizationService } from './salesNormalizationService';
import { MarketNormalizationService } from './marketNormalizationService';
import { PromoNormalizationService } from './promoNormalizationService';
import { ChannelExposureNormalizationService } from './channelExposureNormalizationService';
import { VersionedSnapshotBuilder, type SnapshotSourceRows } from './versionedSnapshotBuilder';
import { VersionedDatasetPublisher } from './versionedDatasetPublisher';

export type ImportSourceType = 'sales' | 'market' | 'promo' | 'tv' | 'visits';
export interface UnifiedImportRequest {
  projectId: string;
  sourceType: ImportSourceType;
  rows: readonly unknown[];
  sourceBatchId?: string;
}
export type UnifiedImportReport = (SalesNormalizationReport | MarketNormalizationReport | PromoNormalizationReport | ExposureCommitReport) & {
  projectId: string;
  sourceType: ImportSourceType;
  sourceBatchId?: string;
  completedAt: string;
};

export interface ImportSourceHandler {
  commit(input: { projectId: string; rows: readonly unknown[]; sourceBatchId?: string }): Promise<SalesNormalizationReport | MarketNormalizationReport | PromoNormalizationReport | ExposureCommitReport>;
}

/** One application entry point for all supported data sources. Each source publication is atomic.
 * Multi-source bundles intentionally run one source at a time: IndexedDB transactions cannot safely
 * be held open while normalizers perform arbitrary asynchronous work. A bundle is not all-or-nothing.
 */
export class UnifiedImportService {
  private readonly snapshotBuilder = new VersionedSnapshotBuilder();
  private readonly snapshotPublisher = new VersionedDatasetPublisher();
  private readonly handlers: Record<ImportSourceType, ImportSourceHandler>;

  constructor(handlers?: Partial<Record<ImportSourceType, ImportSourceHandler>>) {
    const sales = new SalesNormalizationService();
    const market = new MarketNormalizationService();
    const promo = new PromoNormalizationService();
    const exposure = new ChannelExposureNormalizationService();
    this.handlers = {
      sales: { commit: input => sales.normalizeAndCommit(input) },
      market: { commit: input => market.normalizeAndCommit(input) },
      promo: { commit: input => promo.normalizeAndCommit(input) },
      tv: { commit: input => exposure.commitTv(input) },
      visits: { commit: input => exposure.commitVisits(input) },
      ...handlers,
    };
  }

  /** Normalize all five sources before any write, then publish one complete versioned snapshot.
   * This API is safe for an import workflow that has all source files available at once.
   * The existing single-source UI path is intentionally retained for legacy projects only.
   */
  previewSnapshot(input: { projectId: string; sources: Partial<SnapshotSourceRows> }) {
    return this.snapshotBuilder.build(input.projectId, input.sources);
  }

  async importSnapshot(input: { projectId: string; sources: Partial<SnapshotSourceRows>; allowSkippedRows?: boolean }) {
    if (!input.projectId.trim()) throw new Error('Перед импортом необходимо выбрать проект.');
    const snapshot = this.snapshotBuilder.build(input.projectId, input.sources);
    if (snapshot.totalAcceptedRows === 0) {
      const error = new Error('Снимок не содержит ни одной корректной строки; публикация отменена.') as Error & { report?: typeof snapshot };
      error.report = snapshot;
      throw error;
    }
    if (snapshot.totalSkippedRows > 0 && input.allowSkippedRows !== true) {
      const error = new Error(`В снимке пропущено строк: ${snapshot.totalSkippedRows}. Просмотрите ошибки и передайте allowSkippedRows: true только после явного подтверждения.`) as Error & { report?: typeof snapshot };
      error.report = snapshot;
      throw error;
    }
    const publication = await this.snapshotPublisher.publish(input.projectId, snapshot.facts);
    return { ...publication, reports: snapshot.reports, totalInputRows: snapshot.totalInputRows,
      totalAcceptedRows: snapshot.totalAcceptedRows, totalSkippedRows: snapshot.totalSkippedRows };
  }

  async importSource(input: UnifiedImportRequest): Promise<UnifiedImportReport> {
    if (!input.projectId.trim()) throw new Error('Перед импортом необходимо выбрать проект.');
    if (!Array.isArray(input.rows) || input.rows.length === 0) throw new Error('Файл не содержит строк для импорта.');
    const handler = this.handlers[input.sourceType];
    if (!handler) throw new Error(`Неизвестный источник данных: ${String(input.sourceType)}`);
    const report = await handler.commit(input);
    return { ...report, projectId: input.projectId, sourceType: input.sourceType,
      sourceBatchId: input.sourceBatchId, completedAt: new Date().toISOString() };
  }
}
