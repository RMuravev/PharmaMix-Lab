import type { TemporalDatasetResult, PredictorName } from './temporalModelDatasetService';
import type { TemporalMmmFit } from './temporalMmmTrainingService';

export interface CounterfactualDriverResult {
  driver: PredictorName;
  observations: number;
  predictedWithDriverRub: number;
  predictedWithoutDriverRub: number;
  incrementalRevenueRub: number;
  incrementalPctOfWithDriver: number;
}
export interface MarketingCounterfactualReport {
  drivers: CounterfactualDriverResult[];
  warnings: string[];
}
/**
 * Post-fit, one-at-a-time removal of a transformed driver. For lag/adstock/Hill,
 * zero exposure maps to zero transformed exposure (given zero initial carryover).
 * This computes conditional model association, NOT causal incrementality.
 * Does not refit, change other drivers, or use observed test revenue in effects.
 */
export function calculateMarketingCounterfactuals(
  dataset: TemporalDatasetResult,
  fit: Pick<TemporalMmmFit, 'featureNames' | 'coefficients'>,
  options: { standardized: boolean; drivers?: PredictorName[] }
): MarketingCounterfactualReport {
  if (dataset.errors.length) throw new Error('Входная выборка содержит ошибки.');
  const names = dataset.featureNames;
  const coefficients = fit.coefficients;
  if (!dataset.test.length || !names.length || names.join('|') !== fit.featureNames.join('|') || coefficients.length !== names.length + 1 || !coefficients.every(Number.isFinite)) {
    throw new Error('Коэффициенты и признаки не соответствуют тестовой выборке.');
  }
  if (options.standardized && (dataset.trainMean.length !== names.length || dataset.trainStd.length !== names.length)) {
    throw new Error('Нет параметров нормализации обучающей выборки.');
  }
  const drivers = options.drivers ?? names.filter(n => n !== 'marketRevenueRub');
  if (!drivers.length || new Set(drivers).size !== drivers.length || drivers.some(d => !names.includes(d))) throw new Error('Некорректный список драйверов.');
  const baseline = names.map((_, i) => {
    if (!options.standardized) return 0;
    const mean = dataset.trainMean[i], sd = dataset.trainStd[i];
    if (!Number.isFinite(mean) || !Number.isFinite(sd) || sd < 0) throw new Error('Некорректные параметры нормализации.');
    return -mean / (sd || 1);
  });
  const results = drivers.map(driver => {
    const idx = names.indexOf(driver);
    let withRub = 0, withoutRub = 0;
    for (const row of dataset.test) {
      if (row.x.length !== names.length || !row.x.every(Number.isFinite)) throw new Error('Некорректные тестовые факторы.');
      const fullLog = coefficients[0] + row.x.reduce((s, x, j) => s + x * coefficients[j + 1], 0);
      const removedLog = fullLog + (baseline[idx] - row.x[idx]) * coefficients[idx + 1];
      const full = Math.exp(fullLog), removed = Math.exp(removedLog);
      if (!Number.isFinite(full) || !Number.isFinite(removed)) throw new Error('Численное переполнение при контрфактическом прогнозе.');
      withRub += full;
      withoutRub += removed;
    }
    if (!Number.isFinite(withRub) || !Number.isFinite(withoutRub) || withRub <= 0) throw new Error('Некорректная суммарная модельная выручка.');
    return {
      driver, observations: dataset.test.length,
      predictedWithDriverRub: withRub,
      predictedWithoutDriverRub: withoutRub,
      incrementalRevenueRub: withRub - withoutRub,
      incrementalPctOfWithDriver: 100 * (withRub - withoutRub) / withRub
    };
  });
  return { drivers: results, warnings: [
    'Эффект является условным сравнением сценариев одной обученной модели, а не доказательством причинности.',
    'При одновременном отключении нескольких факторов их эффекты могут не суммироваться из-за логарифмической модели.',
    'Контрфактический ноль предполагает отсутствие воздействия и накопленного adstock до рассматриваемого окна; при иной истории необходимо пересчитать всю траекторию факторов.',
    'Прогноз exp(log(y)) не скорректирован на смещение оценки математического ожидания.'
  ] };
}
