import { describe, expect, it } from 'vitest';
import type { ActiveDatasetSnapshot } from './activeDatasetSnapshotRepository';

describe('ActiveDatasetSnapshot contract', () => {
  it('keeps explicit counts for every source, including intentionally empty sources', () => {
    const snapshot: ActiveDatasetSnapshot = {
      projectId: 'p1', datasetVersion: 'p1:v2', legacy: false,
      salesFacts: [], marketFacts: [], promoFacts: [], tvFacts: [], visitFacts: [],
      rowCounts: { salesFacts: 0, marketFacts: 0, promoFacts: 0, tvFacts: 0, visitFacts: 0 },
    };
    expect(Object.values(snapshot.rowCounts)).toHaveLength(5);
    expect(snapshot.legacy).toBe(false);
    expect(snapshot.datasetVersion).toBe('p1:v2');
  });

  it('does not assign a dataset version to a legacy snapshot', () => {
    const snapshot: ActiveDatasetSnapshot = {
      projectId: 'p1', datasetVersion: null, legacy: true,
      salesFacts: [], marketFacts: [], promoFacts: [], tvFacts: [], visitFacts: [],
      rowCounts: { salesFacts: 0, marketFacts: 0, promoFacts: 0, tvFacts: 0, visitFacts: 0 },
    };
    expect(snapshot.datasetVersion).toBeNull();
    expect(snapshot.legacy).toBe(true);
  });
});
