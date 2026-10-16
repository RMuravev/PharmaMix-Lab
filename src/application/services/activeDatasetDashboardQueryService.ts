import { ActiveDatasetSnapshotRepository } from '../../infrastructure/indexeddb/activeDatasetSnapshotRepository';
import { ActiveDatasetAnalyticsService, type DatasetAnalyticsSummary } from './activeDatasetAnalyticsService';

/** The dashboard entry point: repository guarantees one-version reads; service derives metrics. */
export class ActiveDatasetDashboardQueryService {
  constructor(
    private readonly repository = new ActiveDatasetSnapshotRepository(),
    private readonly analytics = new ActiveDatasetAnalyticsService(),
  ) {}

  async execute(projectId: string): Promise<DatasetAnalyticsSummary> {
    const snapshot = await this.repository.getForProject(projectId);
    if (!snapshot.datasetVersion) {
      throw new Error('The project has no active dataset version. Publish a complete current snapshot first.');
    }
    return this.analytics.summarize(snapshot);
  }
}
