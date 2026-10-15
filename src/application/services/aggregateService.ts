import type { AggregateQuery } from '../contracts/repositories';
import type { AggregateRecord } from '../../infrastructure/indexeddb/schema';
import { IndexedDbRepository } from '../../infrastructure/indexeddb/repository';

/** Read-through cache for persisted aggregate views. It never calculates business metrics itself. */
export class AggregateService {
  private readonly repository = new IndexedDbRepository<AggregateRecord>('aggregates');

  async getReady(query: AggregateQuery): Promise<AggregateRecord | undefined> {
    const row = await this.repository.getByIndex('projectId_cacheKey', [query.projectId, query.cacheKey]);
    if (!row || row.aggregateType !== query.aggregateType || row.datasetVersion !== query.datasetVersion ||
      row.algorithmVersion !== query.algorithmVersion || row.status !== 'ready') return undefined;
    return row;
  }

  async save(record: AggregateRecord): Promise<void> {
    if (!record.projectId || !record.cacheKey || !record.datasetVersion || !record.algorithmVersion) {
      throw new Error('Нельзя сохранить агрегат без projectId, cacheKey, datasetVersion и algorithmVersion.');
    }
    await this.repository.put(record);
  }
}
