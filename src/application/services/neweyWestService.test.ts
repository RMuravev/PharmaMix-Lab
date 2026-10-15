import { describe, expect, it } from 'vitest';
import { calculateNeweyWest } from './neweyWestService';

describe('calculateNeweyWest', () => {
  it('returns finite standard errors for a full-rank design', () => {
    const x = Array.from({ length: 8 }, (_, i) => [1, i]);
    const e = [0.2, -0.1, 0.3, -0.2, 0.1, -0.3, 0.2, -0.1];
    const result = calculateNeweyWest({ design: x, residuals: e, maxLag: 2 });
    expect(result.standardErrors).toHaveLength(2);
    expect(result.standardErrors.every(Number.isFinite)).toBe(true);
    expect(result.covariance[0][1]).toBeCloseTo(result.covariance[1][0], 10);
  });
  it('rejects singular design matrices', () => {
    expect(() => calculateNeweyWest({ design: [[1, 1], [1, 1], [1, 1]], residuals: [1, 2, 3], maxLag: 1 })).toThrow(/вырождена/);
  });
  it('validates lag and data shape', () => {
    expect(() => calculateNeweyWest({ design: [[1], [1]], residuals: [1], maxLag: 0 })).toThrow();
    expect(() => calculateNeweyWest({ design: [[1], [1]], residuals: [1, 2], maxLag: 2 })).toThrow(/maxLag/);
  });
});
