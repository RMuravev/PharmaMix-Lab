import { describe, expect, it } from 'vitest';
import { classifyModelFreshness } from './modelRunFreshnessService';

describe('classifyModelFreshness', () => {
  it('marks a result fresh only when its dataset version matches the active version', () => {
    expect(classifyModelFreshness('dataset-2', 'dataset-2').freshness).toBe('fresh');
  });

  it('marks a result stale when the active dataset has changed', () => {
    const result = classifyModelFreshness('dataset-1', 'dataset-2');
    expect(result.freshness).toBe('stale');
    expect(result.reason).toContain('активна версия dataset-2');
  });

  it('does not silently treat legacy results as fresh', () => {
    expect(classifyModelFreshness(undefined, 'dataset-2').freshness).toBe('legacy');
  });

  it('marks freshness unverifiable if no active dataset is published', () => {
    expect(classifyModelFreshness('dataset-1', null).freshness).toBe('unverifiable');
  });
});
