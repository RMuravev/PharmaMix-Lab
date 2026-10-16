import { VersionedSnapshotBuilder, type SnapshotSourceRows } from './versionedSnapshotBuilder';
import { VersionedDatasetPublisher } from './versionedDatasetPublisher';

export type ImportSourceType = 'sales' | 'market' | 'promo' | 'tv' | 'visits';
/** Current import entry point: normalize all five sources, then atomically publish one version. */
export class UnifiedImportService {
  private readonly snapshotBuilder = new VersionedSnapshotBuilder();
  private readonly snapshotPublisher = new VersionedDatasetPublisher();

  /** Normalize all five sources before any write, then publish one complete versioned snapshot. */
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
}
