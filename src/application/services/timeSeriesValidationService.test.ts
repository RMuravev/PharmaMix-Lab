import { describe, expect, it } from 'vitest';
import { validateTimeSeries } from './timeSeriesValidationService';

describe('validateTimeSeries', () => {
  it('detects missing and duplicate monthly periods', () => {
    const report = validateTimeSeries({ observations: [
      { period: '2025-01', actual: 10 },
      { period: '2025-01', actual: 12 },
      { period: '2025-03', actual: 15 },
    ], minimumObservations: 2 });
    expect(report.duplicatePeriods).toEqual(['2025-01']);
    expect(report.missingPeriods).toEqual(['2025-02']);
    expect(report.issues.map((issue) => issue.code)).toContain('DUPLICATE_PERIODS');
    expect(report.issues.map((issue) => issue.code)).toContain('MISSING_MONTHS');
  });

  it('flags invalid periods and non-finite values as errors', () => {
    const report = validateTimeSeries({ observations: [
      { period: '2025-13', actual: Number.NaN, predicted: Number.POSITIVE_INFINITY },
      { period: 'bad', actual: 4, predicted: 5 },
    ], requirePredictions: true, minimumObservations: 2 });
    expect(report.valid).toBe(false);
    expect(report.nonFiniteActualRows).toEqual([0]);
    expect(report.nonFinitePredictionRows).toEqual([0]);
    expect(report.issues.map((issue) => issue.code)).toContain('INVALID_PERIOD');
  });

  it('warns when multiple panel groups are passed as one sequence', () => {
    const report = validateTimeSeries({ observations: [
      { period: '2025-01', actual: 2, group: 'Brand A' },
      { period: '2025-02', actual: 3, group: 'Brand B' },
    ], minimumObservations: 2 });
    expect(report.groups).toBe(2);
    expect(report.issues.map((issue) => issue.code)).toContain('PANEL_GROUPS');
  });

  it('accepts a complete monthly series without fatal issues', () => {
    const report = validateTimeSeries({ observations: [
      { period: '2025-01', actual: 100, predicted: 98 },
      { period: '2025-02', actual: 110, predicted: 112 },
      { period: '2025-03', actual: 120, predicted: 119 },
    ], requirePredictions: true, minimumObservations: 3 });
    expect(report.valid).toBe(true);
    expect(report.missingPeriods).toEqual([]);
    expect(report.duplicatePeriods).toEqual([]);
  });

  it('blocks a holdout when an expected test month is absent', () => {
    const report = validateTimeSeries({ observations: [
      { period: '2025-01', actual: 100, predicted: 98 },
      { period: '2025-03', actual: 120, predicted: 119 },
    ], expectedPeriods: ['2025-01', '2025-02', '2025-03'], requirePredictions: true, minimumObservations: 2 });
    expect(report.valid).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toContain('EXPECTED_MONTH_MISSING');
    expect(report.issues.find((issue) => issue.code === 'MISSING_MONTHS')?.severity).toBe('error');
  });

  it('rejects malformed or duplicate expected holdout periods', () => {
    const report = validateTimeSeries({ observations: [
      { period: '2025-01', actual: 10, predicted: 11 },
      { period: '2025-02', actual: 12, predicted: 13 },
    ], expectedPeriods: ['2025-01', 'bad', '2025-01'], requirePredictions: true, minimumObservations: 2 });
    expect(report.valid).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toContain('INVALID_EXPECTED_PERIOD');
    expect(report.issues.map((issue) => issue.code)).toContain('DUPLICATE_EXPECTED_PERIOD');
  });

});
