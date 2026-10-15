import type { DesignMatrixRow, LaggedFactor } from './panelDesignMatrixService';

export type PredictorName = LaggedFactor | 'marketRevenueRub';
export interface PreparedObservation { period: string; panelKey: string; actualRevenueRub: number; x: number[] }
export interface TemporalDatasetResult {
  train: PreparedObservation[]; test: PreparedObservation[];
  featureNames: PredictorName[]; trainMean: number[]; trainStd: number[];
  errors: string[]; warnings: string[];
}
const validPeriod = (v: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
const panelKey = (r: DesignMatrixRow) => JSON.stringify([r.brand, r.region, r.chain]);
/**
 * Split a previously lagged design matrix on calendar boundaries, then fit
 * normalization exclusively on training rows. This does not train an MMM;
 * callers must fit coefficients and tune hyperparameters using train only.
 */
export function prepareTemporalModelDataset(
  rows: DesignMatrixRow[],
  options: { testStart: string; testEnd: string; featureNames?: PredictorName[]; standardize?: boolean }
): TemporalDatasetResult {
  const errors: string[] = [], warnings: string[] = [];
  const featureNames = options.featureNames ?? ['tvTrp', 'weightedVisits', 'bonusEstimateRub'];
  const empty = (): TemporalDatasetResult => ({ train: [], test: [], featureNames, trainMean: [], trainStd: [], errors, warnings });
  if (!validPeriod(options.testStart) || !validPeriod(options.testEnd) || options.testStart > options.testEnd) {
    errors.push('Некорректные границы тестового периода.'); return empty();
  }
  if (!featureNames.length || new Set(featureNames).size !== featureNames.length || featureNames.some(f => !['tvTrp','weightedVisits','bonusEstimateRub','marketRevenueRub'].includes(f))) {
    errors.push('Список факторов пуст, содержит повторы или неизвестные имена.'); return empty();
  }
  const seen = new Set<string>();
  const train: PreparedObservation[] = [], test: PreparedObservation[] = [];
  for (const row of rows) {
    if (!validPeriod(row.period)) { errors.push(`Некорректный месяц: ${row.period}`); continue; }
    if (row.period > options.testEnd) { errors.push(`Наблюдение ${row.period} находится после тестового окна.`); continue; }
    const pk = panelKey(row), id = JSON.stringify([pk, row.period]);
    if (seen.has(id)) { errors.push(`Дублирующая запись панели ${pk} за ${row.period}.`); continue; }
    seen.add(id);
    if (!Number.isFinite(row.actualRevenueRub) || row.actualRevenueRub <= 0) {
      errors.push(`Для логарифмической MMM выручка должна быть положительной: ${pk} ${row.period}.`); continue;
    }
    const x = featureNames.map(f => row.features[f]);
    if (x.some(v => v === null || !Number.isFinite(v))) {
      errors.push(`Отсутствует или некорректен фактор: ${pk} ${row.period}.`); continue;
    }
    const item = { period: row.period, panelKey: pk, actualRevenueRub: row.actualRevenueRub, x: x as number[] };
    (row.period < options.testStart ? train : test).push(item);
  }
  if (!train.length) errors.push('Нет обучающих наблюдений до начала тестового окна.');
  if (!test.length) errors.push('Нет наблюдений в тестовом окне.');
  if (errors.length) return empty();
  train.sort((a,b) => a.period.localeCompare(b.period) || a.panelKey.localeCompare(b.panelKey));
  test.sort((a,b) => a.period.localeCompare(b.period) || a.panelKey.localeCompare(b.panelKey));
  const mean = featureNames.map((_,j) => train.reduce((s,r) => s + r.x[j],0)/train.length);
  const std = mean.map((m,j) => Math.sqrt(train.reduce((s,r) => s + (r.x[j]-m)**2,0)/train.length));
  if (std.some(s => s === 0)) warnings.push('Есть константные на обучении факторы: их масштаб оставлен равным 1; проверьте идентифицируемость модели.');
  if (options.standardize) {
    for (const r of [...train,...test]) r.x = r.x.map((v,j) => (v-mean[j])/(std[j] || 1));
  }
  warnings.push('Лаги должны формироваться по календарю до разделения; параметры модели, отбор признаков и гиперпараметры подбираются только на train.');
  return { train, test, featureNames, trainMean: mean, trainStd: std, errors, warnings };
}
