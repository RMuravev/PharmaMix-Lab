export interface TimeSeriesObservation {
  period: string;
  actual: number;
  predicted?: number;
  group?: string;
}

export interface TimeSeriesValidationInput {
  observations: TimeSeriesObservation[];
  /** YYYY-MM periods are expected for monthly MMM data. */
  frequency?: 'monthly';
  minimumObservations?: number;
  requirePredictions?: boolean;
  /** Expected monthly periods for a holdout window; missing expected periods are critical. */
  expectedPeriods?: string[];
}

export interface TimeSeriesValidationIssue {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  affectedRows?: number[];
}

export interface TimeSeriesValidationReport {
  valid: boolean;
  observations: number;
  groups: number;
  firstPeriod: string | null;
  lastPeriod: string | null;
  missingPeriods: string[];
  duplicatePeriods: string[];
  nonFiniteActualRows: number[];
  nonFinitePredictionRows: number[];
  issues: TimeSeriesValidationIssue[];
  recommendations: string[];
}

function parseMonth(period: string): number | null {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(period);
  if (!match) return null;
  return Number(match[1]) * 12 + Number(match[2]) - 1;
}
function formatMonth(index: number): string {
  const year = Math.floor(index / 12);
  const month = index % 12 + 1;
  return `${year}-${String(month).padStart(2, '0')}`;
}

/**
 * Checks whether a monthly MMM series is suitable for downstream time-series diagnostics.
 * This is a data-quality gate, not a statistical test and does not infer causality.
 */
export function validateTimeSeries(input: TimeSeriesValidationInput): TimeSeriesValidationReport {
  if (!Array.isArray(input.observations)) throw new Error('observations должен быть массивом.');
  const minimum = input.minimumObservations ?? 24;
  if (!Number.isInteger(minimum) || minimum < 2) throw new Error('minimumObservations должен быть целым числом не меньше 2.');

  const rows = input.observations;
  const issues: TimeSeriesValidationIssue[] = [];
  const recommendations: string[] = [];
  const badActual: number[] = [];
  const badPrediction: number[] = [];
  const periodCounts = new Map<string, number>();
  const expectedPeriods = input.expectedPeriods ?? [];
  const invalidExpectedPeriods = expectedPeriods.filter((period) => typeof period !== 'string' || parseMonth(period) === null);
  const duplicateExpectedPeriods = expectedPeriods.filter((period, index) => expectedPeriods.indexOf(period) !== index);
  const groups = new Set<string>();
  let invalidPeriodRows = 0;

  rows.forEach((row, index) => {
    if (!row || typeof row.period !== 'string' || parseMonth(row.period) === null) {
      invalidPeriodRows += 1;
    } else {
      periodCounts.set(row.period, (periodCounts.get(row.period) ?? 0) + 1);
    }
    if (!Number.isFinite(row?.actual)) badActual.push(index);
    if (input.requirePredictions && !Number.isFinite(row?.predicted)) badPrediction.push(index);
    if (row?.group !== undefined && String(row.group).trim()) groups.add(String(row.group).trim());
  });

  const duplicatePeriods = [...periodCounts.entries()].filter(([, count]) => count > 1).map(([period]) => period).sort();
  const validPeriods = [...periodCounts.keys()].sort((a, b) => parseMonth(a)! - parseMonth(b)!);
  const missingPeriods: string[] = [];
  if (validPeriods.length > 1) {
    const first = parseMonth(validPeriods[0])!;
    const last = parseMonth(validPeriods[validPeriods.length - 1])!;
    const seen = new Set(validPeriods);
    for (let month = first; month <= last; month += 1) {
      const formatted = formatMonth(month);
      if (!seen.has(formatted)) missingPeriods.push(formatted);
    }
  }

  if (rows.length < minimum) issues.push({ severity: 'warning', code: 'SHORT_SERIES', message: `Мало наблюдений: ${rows.length}; рекомендованный минимум — ${minimum}.` });
  if (invalidExpectedPeriods.length) issues.push({ severity: 'error', code: 'INVALID_EXPECTED_PERIOD', message: 'Ожидаемое окно содержит некорректные периоды YYYY-MM.' });
  if (duplicateExpectedPeriods.length) issues.push({ severity: 'error', code: 'DUPLICATE_EXPECTED_PERIOD', message: 'Ожидаемое окно содержит повторяющиеся месяцы.' });
  if (invalidPeriodRows) issues.push({ severity: 'error', code: 'INVALID_PERIOD', message: `${invalidPeriodRows} строк имеют некорректный период. Используйте YYYY-MM.` });
  if (badActual.length) issues.push({ severity: 'error', code: 'INVALID_ACTUAL', message: `${badActual.length} строк имеют отсутствующее или нечисловое фактическое значение.`, affectedRows: badActual });
  if (badPrediction.length) issues.push({ severity: 'error', code: 'INVALID_PREDICTION', message: `${badPrediction.length} строк имеют отсутствующий или нечисловой прогноз.`, affectedRows: badPrediction });
  if (duplicatePeriods.length) issues.push({ severity: 'warning', code: 'DUPLICATE_PERIODS', message: `Обнаружены повторяющиеся месяцы: ${duplicatePeriods.slice(0, 6).join(', ')}${duplicatePeriods.length > 6 ? '…' : ''}. Для одной временной серии сначала агрегируйте данные до одного наблюдения на месяц.` });
  if (missingPeriods.length) issues.push({ severity: expectedPeriods.length ? 'error' : 'warning', code: 'MISSING_MONTHS', message: `В диапазоне отсутствуют месяцы: ${missingPeriods.slice(0, 6).join(', ')}${missingPeriods.length > 6 ? '…' : ''}.` });
  if (expectedPeriods.length) {
    const observed = new Set(validPeriods);
    const absentExpected = [...new Set(expectedPeriods)].filter((period) => parseMonth(period) !== null && !observed.has(period));
    if (absentExpected.length) issues.push({ severity: 'error', code: 'EXPECTED_MONTH_MISSING', message: `В тестовом окне отсутствуют ожидаемые месяцы: ${absentExpected.slice(0, 6).join(', ')}${absentExpected.length > 6 ? '…' : ''}.` });
    const unexpected = validPeriods.filter((period) => !expectedPeriods.includes(period));
    if (unexpected.length) issues.push({ severity: 'error', code: 'UNEXPECTED_MONTH', message: `Найдены месяцы вне тестового окна: ${unexpected.slice(0, 6).join(', ')}${unexpected.length > 6 ? '…' : ''}.` });
  }
  if (groups.size > 1) issues.push({ severity: 'warning', code: 'PANEL_GROUPS', message: `Обнаружено ${groups.size} групп. Не объединяйте их в одну последовательность HAC без группировки и корректной временной структуры.` });
  if (validPeriods.length < 2) issues.push({ severity: 'error', code: 'INSUFFICIENT_PERIOD_RANGE', message: 'Нужно минимум два корректных месячных периода для временной диагностики.' });

  if (missingPeriods.length) recommendations.push('Определите, почему отсутствуют месяцы: нулевые продажи, пропуск загрузки или неполное покрытие. Не заполняйте пропуски нулями автоматически.');
  if (duplicatePeriods.length) recommendations.push('Агрегируйте строки до уникального ключа серии и месяца; для панельных данных ключ должен включать идентификатор группы.');
  if (groups.size > 1) recommendations.push('Проверяйте временную структуру внутри каждой серии (например, бренд × регион), а не между соседними строками разных групп.');
  if (rows.length < minimum) recommendations.push('Используйте короткий ряд с осторожностью: сезонность и лаги могут быть плохо идентифицируемы.');
  recommendations.push('Проверка качества данных не подтверждает статистическую значимость и не доказывает причинный эффект маркетинговых активностей.');

  const hasErrors = issues.some((issue) => issue.severity === 'error');
  return {
    valid: !hasErrors,
    observations: rows.length,
    groups: groups.size || (rows.length ? 1 : 0),
    firstPeriod: validPeriods[0] ?? null,
    lastPeriod: validPeriods[validPeriods.length - 1] ?? null,
    missingPeriods,
    duplicatePeriods,
    nonFiniteActualRows: badActual,
    nonFinitePredictionRows: badPrediction,
    issues,
    recommendations,
  };
}
