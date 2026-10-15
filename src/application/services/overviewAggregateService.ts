import { buildOverviewAggregate, type SalesFactForOverview } from '../../domain/aggregates/overview';
import type { AggregateRecord } from '../../infrastructure/indexeddb/schema';
import { AggregateService } from './aggregateService';

const ALGORITHM_VERSION = 'overview-sales-v1';

/** Builds and persists a reproducible Overview aggregate for a specific dataset version. */
export class OverviewAggregateService {
  constructor(private readonly cache = new AggregateService()) {}

  async getOrBuild(input: {
    projectId: string;
    datasetVersion: string;
    rows: readonly SalesFactForOverview[];
  }): Promise<AggregateRecord> {
    const cacheKey = `dashboard.overview:${input.datasetVersion}:${ALGORITHM_VERSION}`;
    const cached = await this.cache.getReady({
      projectId: input.projectId,
      aggregateType: 'dashboard.overview',
      cacheKey,
      datasetVersion: input.datasetVersion,
      algorithmVersion: ALGORITHM_VERSION,
    });
    if (cached) return cached;

    const aggregate = buildOverviewAggregate(input.rows);
    const now = new Date().toISOString();
    const record: AggregateRecord = {
      id: `${input.projectId}:${cacheKey}`,
      projectId: input.projectId,
      aggregateType: 'dashboard.overview',
      cacheKey,
      datasetVersion: input.datasetVersion,
      algorithmVersion: ALGORITHM_VERSION,
      dimensions: {},
      series: { byPeriod: aggregate.byPeriod, byBrand: aggregate.byBrand },
      metrics: {
        revenueRub: aggregate.total.revenueRub,
        units: aggregate.total.units,
        brands: aggregate.total.brands,
        periods: aggregate.total.periods,
      },
      status: 'ready',
      generatedAt: now,
      createdAt: now,
      updatedAt: now,
      schemaVersion: 1,
    };
    // Store chart series as a separate typed payload rather than flattening it into KPI metrics.
    await this.cache.save(record);
    return record;
  }
}
