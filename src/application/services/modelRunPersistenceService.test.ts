import { describe, expect, it } from 'vitest';
import { assertExpectedDatasetVersion } from './modelRunPersistenceService';

describe('assertExpectedDatasetVersion', () => {
  it('allows persistence when the calculation used the active dataset version', () => {
    expect(() => assertExpectedDatasetVersion('dataset-7', 'dataset-7')).not.toThrow();
  });

  it('allows a caller without an optimistic guard', () => {
    expect(() => assertExpectedDatasetVersion(undefined, 'dataset-7')).not.toThrow();
  });

  it('rejects results calculated against a superseded dataset', () => {
    expect(() => assertExpectedDatasetVersion('dataset-3', 'dataset-4')).toThrow(/Перезапустите расчёт/);
  });
});
