import { describe, expect, it } from 'vitest';
import { calculateRegressionDiagnostics } from './regressionDiagnosticsService';

describe('calculateRegressionDiagnostics', () => {
  it('calculates error metrics and adjusted R²', () => {
    const result = calculateRegressionDiagnostics({ actual: [10, 20, 30], predicted: [12, 18, 33], predictorCount: 1 });
    expect(result.observations).toBe(3);
    expect(result.mae).toBeCloseTo(7 / 3);
    expect(result.rmse).toBeCloseTo(Math.sqrt(17 / 3));
    expect(result.mapePct).toBeCloseTo((20 + 10 + 10) / 3);
    expect(result.rSquared).not.toBeNull();
    expect(result.adjustedRSquared).not.toBeNull();
  });

  it('does not divide by zero for MAPE and WAPE', () => {
    const result = calculateRegressionDiagnostics({ actual: [0, 0], predicted: [1, -1] });
    expect(result.mapePct).toBeNull();
    expect(result.wapePct).toBeNull();
    expect(result.excludedZeroActualForMape).toBe(2);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('marks R² undefined for constant actual values and guards adjusted R²', () => {
    const result = calculateRegressionDiagnostics({ actual: [5, 5], predicted: [5, 6], predictorCount: 1 });
    expect(result.rSquared).toBeNull();
    expect(result.adjustedRSquared).toBeNull();
  });

  it('rejects mismatched lengths and non-finite inputs', () => {
    expect(() => calculateRegressionDiagnostics({ actual: [1], predicted: [] })).toThrow(/одинаковой длины/);
    expect(() => calculateRegressionDiagnostics({ actual: [Number.NaN], predicted: [1] })).toThrow(/конечные числа/);
  });
});
