import { describe, it, expect } from 'vitest';
import { ols, rub, pct, short } from './math';

describe('Math Utilities', () => {
  it('should format currency correctly with rub', () => {
    expect(rub(1500000)).toContain(' ₽');
    expect(rub(0)).toBe('0 ₽');
  });

  it('should format percentages correctly with pct', () => {
    expect(pct(0.154)).toContain('%');
  });

  it('should format numbers with short notation', () => {
    expect(short(2500000)).toBeDefined();
  });

  it('should calculate OLS regression coefficients correctly', () => {
    // Simple linear regression: y = 2x + 1
    const X = [
      [1, 0],
      [1, 1],
      [1, 2],
      [1, 3]
    ];
    const y = [1, 3, 5, 7];
    const result = ols(X, y);
    expect(result.beta).toBeDefined();
    expect(result.beta.length).toBe(2);
    // Intercept should be ~1, slope should be ~2
    expect(result.beta[0]).toBeCloseTo(1, 1);
    expect(result.beta[1]).toBeCloseTo(2, 1);
  });
});
