import { describe, expect, it } from 'vitest';
import { validatePanelTimeSeries } from './panelTimeSeriesValidationService';

describe('validatePanelTimeSeries', () => {
  it('checks missing periods independently within each group', () => {
    const report = validatePanelTimeSeries({
      observations: [
        { period: '2025-01', actual: 10, group: 'Brand A' },
        { period: '2025-02', actual: 11, group: 'Brand A' },
        { period: '2025-01', actual: 20, group: 'Brand B' },
        { period: '2025-03', actual: 22, group: 'Brand B' },
      ],
      minimumObservations: 2,
    });
    expect(report.groups).toBe(2);
    expect(report.valid).toBe(true); // missing period is a warning unless a holdout is specified
    expect(report.groupReports.find((group) => group.group === 'Brand B')?.report.missingPeriods).toEqual(['2025-02']);
    expect(report.issues.some((issue) => issue.group === 'Brand B' && issue.code === 'MISSING_MONTHS')).toBe(true);
  });

  it('blocks if any panel group is missing an expected holdout month', () => {
    const report = validatePanelTimeSeries({
      observations: [
        { period: '2025-01', actual: 10, predicted: 9, group: 'A' },
        { period: '2025-02', actual: 11, predicted: 12, group: 'A' },
        { period: '2025-01', actual: 20, predicted: 19, group: 'B' },
      ],
      expectedPeriods: ['2025-01', '2025-02'],
      minimumObservations: 2,
      requirePredictions: true,
    });
    expect(report.valid).toBe(false);
    expect(report.issues.some((issue) => issue.group === 'B' && issue.code === 'EXPECTED_MONTH_MISSING')).toBe(true);
  });

  it('supports a custom group key and warns about mixed/unidentified observations only by assigning a stable bucket', () => {
    const report = validatePanelTimeSeries({
      observations: [
        { period: '2025-01', actual: 1 },
        { period: '2025-02', actual: 2 },
        { period: '2025-01', actual: 3 },
        { period: '2025-02', actual: 4 },
      ],
      groupOf: (_row, index) => index < 2 ? 'Region North' : 'Region South',
      minimumObservations: 2,
    });
    expect(report.groups).toBe(2);
    expect(report.issues[0].code).toBe('PANEL_VALIDATED_SEPARATELY');
    expect(report.groupReports.every((group) => group.report.valid)).toBe(true);
  });
});
