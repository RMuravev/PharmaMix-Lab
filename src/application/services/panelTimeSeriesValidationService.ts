import {
  validateTimeSeries,
  type TimeSeriesObservation,
  type TimeSeriesValidationInput,
  type TimeSeriesValidationReport,
} from './timeSeriesValidationService';

export interface PanelTimeSeriesValidationInput extends Omit<TimeSeriesValidationInput, 'observations'> {
  observations: TimeSeriesObservation[];
  /** Optional stable group key. If omitted, observation.group is used. */
  groupOf?: (observation: TimeSeriesObservation, index: number) => string | null | undefined;
}

export interface PanelTimeSeriesGroupReport {
  group: string;
  report: TimeSeriesValidationReport;
}

export interface PanelTimeSeriesValidationReport {
  valid: boolean;
  groups: number;
  observations: number;
  groupReports: PanelTimeSeriesGroupReport[];
  issues: Array<{ severity: 'error' | 'warning' | 'info'; code: string; message: string; group?: string }>;
  recommendations: string[];
}

/**
 * Validates each panel series independently so a missing month in one group
 * cannot be masked by another group's observation for the same month. This is
 * a data-quality check only; it does not establish panel-model validity.
 */
export function validatePanelTimeSeries(input: PanelTimeSeriesValidationInput): PanelTimeSeriesValidationReport {
  if (!Array.isArray(input.observations)) throw new Error('observations должен быть массивом.');
  const groupOf = input.groupOf ?? ((observation: TimeSeriesObservation) => observation.group);
  const buckets = new Map<string, TimeSeriesObservation[]>();
  input.observations.forEach((observation, index) => {
    const rawGroup = groupOf(observation, index);
    const group = typeof rawGroup === 'string' && rawGroup.trim() ? rawGroup.trim() : '__ungrouped__';
    const bucket = buckets.get(group) ?? [];
    bucket.push({ ...observation, group });
    buckets.set(group, bucket);
  });

  const groupReports = [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([group, observations]) => ({
    group,
    report: validateTimeSeries({
      observations,
      frequency: input.frequency,
      minimumObservations: input.minimumObservations,
      requirePredictions: input.requirePredictions,
      expectedPeriods: input.expectedPeriods,
    }),
  }));

  const issues: PanelTimeSeriesValidationReport['issues'] = [];
  for (const { group, report } of groupReports) {
    for (const issue of report.issues) {
      // The base validator's PANEL_GROUPS warning is irrelevant inside a bucket.
      if (issue.code === 'PANEL_GROUPS') continue;
      issues.push({ ...issue, message: `[${group}] ${issue.message}`, group });
    }
  }
  if (groupReports.length > 1) {
    issues.unshift({
      severity: 'info',
      code: 'PANEL_VALIDATED_SEPARATELY',
      message: `Проверено отдельных временных серий: ${groupReports.length}. Пропуски и дубликаты оценивались внутри каждой группы.`,
    });
  }
  const recommendations = [...new Set(groupReports.flatMap(({ report }) => report.recommendations))];
  if (groupReports.some(({ report }) => report.issues.some((issue) => issue.code === 'MISSING_MONTHS' || issue.code === 'DUPLICATE_PERIODS'))) {
    recommendations.push('Перед HAC/Newey–West сначала сформируйте отдельную непрерывную временную последовательность для каждой группы; не сортируйте строки разных групп как один ряд.');
  }

  return {
    valid: groupReports.every(({ report }) => report.valid),
    groups: groupReports.length,
    observations: input.observations.length,
    groupReports,
    issues,
    recommendations: [...new Set(recommendations)],
  };
}
