import { describe, expect, it } from 'vitest';
import { createCalculationCacheKey } from './cacheKey';

describe('createCalculationCacheKey', () => {
  const base = { calculationType: 'mmm', datasetVersion: 'dataset-7', algorithmVersion: '2.1', params: { lag: 2, alpha: 0.3 } };
  it('is deterministic regardless of object key order', () => {
    expect(createCalculationCacheKey(base)).toBe(createCalculationCacheKey({ ...base, params: { alpha: 0.3, lag: 2 } }));
  });
  it('changes when dataset version changes', () => {
    expect(createCalculationCacheKey(base)).not.toBe(createCalculationCacheKey({ ...base, datasetVersion: 'dataset-8' }));
  });
  it('changes when filters change', () => {
    expect(createCalculationCacheKey({ ...base, filters: { brand: 'A' } })).not.toBe(createCalculationCacheKey({ ...base, filters: { brand: 'B' } }));
  });
});
