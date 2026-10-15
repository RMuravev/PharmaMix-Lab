import { describe, expect, it } from 'vitest';
import { classifyModelFreshness } from './modelRunFreshnessService';
import { ModelResultNotCurrentError } from './currentModelResultService';

describe('current model result guard', () => {
  it('allows only matching versions to be classified as fresh', () => {
    expect(classifyModelFreshness('v4', 'v4').freshness).toBe('fresh');
  });

  it('classifies results from an older dataset as stale', () => {
    expect(classifyModelFreshness('v3', 'v4').freshness).toBe('stale');
  });

  it('provides a typed error for consumers that must reject non-current results', () => {
    const error = new ModelResultNotCurrentError('stale');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('ModelResultNotCurrentError');
    expect(error.code).toBe('MODEL_RESULT_NOT_CURRENT');
  });
});
