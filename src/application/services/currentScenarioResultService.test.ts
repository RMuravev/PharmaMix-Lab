import { describe, expect, it } from 'vitest';
import { classifyModelFreshness } from './modelRunFreshnessService';

describe('scenario freshness policy', () => {
  it('accepts a result only when its dataset version equals the active version', () => {
    expect(classifyModelFreshness('v2', 'v2').freshness).toBe('fresh');
  });

  it('marks scenario results stale after the active dataset changes', () => {
    expect(classifyModelFreshness('v1', 'v2').freshness).toBe('stale');
  });

  it('does not treat unversioned legacy scenario results as current', () => {
    expect(classifyModelFreshness(undefined, 'v2').freshness).toBe('legacy');
  });

  it('cannot verify results if there is no active dataset version', () => {
    expect(classifyModelFreshness('v2', null).freshness).toBe('unverifiable');
  });
});
