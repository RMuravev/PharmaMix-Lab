import { describe, expect, it } from 'vitest';
import { calculateOlsInference } from './olsInferenceService';

describe('calculateOlsInference', () => {
  it('estimates coefficients and confidence intervals for a full-rank design', () => {
    const x = [1, 2, 3, 4, 5, 6].map((v) => [1, v]);
    const y = [3.1, 4.9, 7.2, 8.8, 11.1, 12.9];
    const result = calculateOlsInference({ designMatrix: x, actual: y, coefficientNames: ['intercept', 'trend'] });
    expect(result.degreesOfFreedom).toBe(4);
    expect(result.coefficients[0].estimate).toBeCloseTo(1.12, 1);
    expect(result.coefficients[1].estimate).toBeCloseTo(1.97, 1);
    expect(result.coefficients[1].confidenceInterval).not.toBeNull();
  });
  it('does not claim inference for a singular design matrix', () => {
    const result = calculateOlsInference({ designMatrix: [[1, 1], [1, 1], [1, 1]], actual: [1, 2, 3] });
    expect(result.coefficients[0].standardError).toBeNull();
    expect(result.warnings.join(' ')).toMatch(/вырождена/);
  });
  it('warns when there are not enough observations', () => {
    const result = calculateOlsInference({ designMatrix: [[1, 2], [1, 3]], actual: [4, 5] });
    expect(result.degreesOfFreedom).toBe(0);
    expect(result.warnings.join(' ')).toMatch(/Недостаточно наблюдений/);
  });
  it('validates input dimensions and finite values', () => {
    expect(() => calculateOlsInference({ designMatrix: [[1], [1]], actual: [1] })).toThrow(/одинаковую/);
    expect(() => calculateOlsInference({ designMatrix: [[1], [Number.NaN]], actual: [1, 2] })).toThrow(/конечные числа/);
  });
});
