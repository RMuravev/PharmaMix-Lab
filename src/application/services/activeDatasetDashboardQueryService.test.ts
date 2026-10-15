import { describe, expect, it, vi } from 'vitest';
import { ActiveDatasetDashboardQueryService } from './activeDatasetDashboardQueryService';
import type { ActiveDatasetSnapshot } from '../../infrastructure/indexeddb/activeDatasetSnapshotRepository';

const emptySnapshot: ActiveDatasetSnapshot = {
  projectId: 'p1', datasetVersion: 'v3', legacy: false,
  salesFacts: [], marketFacts: [], promoFacts: [], tvFacts: [], visitFacts: [],
  rowCounts: { salesFacts: 0, marketFacts: 0, promoFacts: 0, tvFacts: 0, visitFacts: 0 },
};

describe('ActiveDatasetDashboardQueryService', () => {
  it('loads one active snapshot and derives its dashboard summary', async () => {
    const repository = { getForProject: vi.fn().mockResolvedValue(emptySnapshot) };
    const service = new ActiveDatasetDashboardQueryService(repository as never);
    const result = await service.execute('p1');
    expect(repository.getForProject).toHaveBeenCalledWith('p1');
    expect(result.datasetVersion).toBe('v3');
    expect(result.sourceWarnings).toHaveLength(5);
  });
});
