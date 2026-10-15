import { describe, expect, it } from 'vitest';
import { calculateHacInference } from './hacInferenceService';

describe('calculateHacInference', () => {
  it('returns OLS estimates with HAC errors and intervals', () => {
    const x = Array.from({ length: 12 }, (_, i) => [1, i]);
    const y = x.map((row, i) => 2 + 0.5 * row[1] + [0.2, -0.1, 0.15, -0.2][i % 4]);
    const result = calculateHacInference({ designMatrix: x, actual: y, maxLag: 2, coefficientNames: ['intercept', 'trend'] });
    expect(result.coefficients[0].estimate).toBeCloseTo(2, 1);
    expect(result.coefficients[1].estimate).toBeCloseTo(0.5, 2);
    expect(result.coefficients[1].standardError).toBeGreaterThan(0);
    expect(result.coefficients[1].confidenceInterval).toHaveLength(2);
    expect(result.warnings.some((warning) => warning.includes('p-value не рассчитывается'))).toBe(true);
  });
  it('flags too few observations without inventing inference', () => {
    const result = calculateHacInference({ designMatrix: [[1, 1], [1, 2]], actual: [2, 3], maxLag: 0 });
    expect(result.coefficients[0].standardError).toBeNull();
    expect(result.warnings[0]).toMatch(/Недостаточно наблюдений/);
  });
  it('rejects non-finite values', () => {
    expect(() => calculateHacInference({ designMatrix: [[1], [1]], actual: [1, Number.NaN], maxLag: 0 })).toThrow(/конечные числа/);
  });
});
