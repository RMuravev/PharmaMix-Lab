import { trainTemporalMmm } from './temporalMmmTrainingService';
import type { PreparedObservation, TemporalDatasetResult } from './temporalModelDatasetService';

export interface RidgeFoldScore { validationMonths: string[]; trainCount: number; validationCount: number; wapePct: number | null; rmse: number }
export interface RidgeCandidateScore { lambda: number; folds: RidgeFoldScore[]; pooledWapePct: number | null; pooledRmse: number; failed?: string }
export interface RidgeTuningResult { bestLambda: number; candidates: RidgeCandidateScore[]; finalFit: ReturnType<typeof trainTemporalMmm>; warnings: string[] }

/** Expanding-window calendar CV. The outer test is never touched until final evaluation. */
export function tuneTemporalRidge(
  dataset: TemporalDatasetResult,
  options: { lambdas: number[]; minTrainMonths?: number; validationMonths?: number; folds?: number }
): RidgeTuningResult {
  if (dataset.errors.length) throw new Error(`Некорректная выборка: ${dataset.errors.join('; ')}`);
  const { train, test, featureNames } = dataset;
  const lambdas = options.lambdas;
  if (!lambdas.length || lambdas.some(x => !Number.isFinite(x) || x < 0) || new Set(lambdas).size !== lambdas.length) throw new Error('Нужны уникальные конечные неотрицательные lambda.');
  const minTrainMonths = options.minTrainMonths ?? 6, validationMonths = options.validationMonths ?? 2, foldCount = options.folds ?? 3;
  if (![minTrainMonths, validationMonths, foldCount].every(x => Number.isInteger(x) && x > 0)) throw new Error('Параметры окон должны быть положительными целыми числами.');
  if (!train.length || !test.length || train.some(r => test.some(t => r.period >= t.period))) throw new Error('Train должен предшествовать внешнему test.');
  const months = [...new Set(train.map(r => r.period))].sort();
  if (months.length < minTrainMonths + validationMonths * foldCount) throw new Error('Недостаточно обучающих месяцев для временной кросс-валидации.');
  const candidates = lambdas.map(lambda => {
    const folds: RidgeFoldScore[] = [];
    const pooledActual: number[] = [], pooledPredicted: number[] = [];
    try {
      for (let k = foldCount - 1; k >= 0; k--) {
        const valEnd = months.length - k * validationMonths;
        const valStart = valEnd - validationMonths;
        const fitMonths = new Set(months.slice(0, valStart));
        const valMonths = months.slice(valStart, valEnd);
        const valSet = new Set(valMonths);
        const fitRows = train.filter(r => fitMonths.has(r.period));
        const valRows = train.filter(r => valSet.has(r.period));
        if (!fitRows.length || !valRows.length) throw new Error('Пустой временной fold.');
        // Refit scaling exclusively on the current fold's training months.
        const means = featureNames.map((_, j) => fitRows.reduce((s, r) => s + r.x[j], 0) / fitRows.length);
        const stds = means.map((m, j) => Math.sqrt(fitRows.reduce((s, r) => s + (r.x[j] - m) ** 2, 0) / fitRows.length) || 1);
        const scale = (rows: PreparedObservation[]) => rows.map(r => ({ ...r, x: r.x.map((v, j) => (v - means[j]) / stds[j]) }));
        const foldDataset: TemporalDatasetResult = { train: scale(fitRows), test: scale(valRows), featureNames, trainMean: means, trainStd: stds, errors: [], warnings: [] };
        const fit = trainTemporalMmm(foldDataset, { model: 'ridge', lambda });
        pooledActual.push(...fit.testPredictions.map(r => r.actualRevenueRub));
        pooledPredicted.push(...fit.testPredictions.map(r => r.predictedRevenueRub));
        folds.push({ validationMonths: valMonths, trainCount: fitRows.length, validationCount: valRows.length, wapePct: fit.diagnostics.wapePct, rmse: fit.diagnostics.rmse });
      }
      const absoluteError = pooledActual.reduce((s, a, i) => s + Math.abs(a - pooledPredicted[i]), 0);
      const absoluteActual = pooledActual.reduce((s, a) => s + Math.abs(a), 0);
      const squaredError = pooledActual.reduce((s, a, i) => s + (a - pooledPredicted[i]) ** 2, 0);
      return { lambda, folds, pooledWapePct: absoluteActual > 0 ? 100 * absoluteError / absoluteActual : null, pooledRmse: Math.sqrt(squaredError / pooledActual.length) };
    } catch (error) {
      return { lambda, folds, pooledWapePct: null, pooledRmse: Infinity, failed: error instanceof Error ? error.message : String(error) };
    }
  });
  const eligible = candidates.filter(c => !c.failed && c.pooledWapePct !== null);
  if (!eligible.length) throw new Error('Ни один кандидат Ridge не прошёл временную кросс-валидацию.');
  eligible.sort((a, b) => (a.pooledWapePct! - b.pooledWapePct!) || a.lambda - b.lambda);
  const bestLambda = eligible[0].lambda;
  // dataset may already be standardized on outer train: finalFit preserves its exact scale.
  const finalFit = trainTemporalMmm(dataset, { model: 'ridge', lambda: bestLambda });
  return { bestLambda, candidates, finalFit, warnings: [
    'Внутренняя CV использует только месяцы train; внешний test оценивается один раз после выбора lambda.',
    'Если входной train уже нормализован по всему внешнему train, внутренняя нормализация пересчитывается на каждом fold, но выбор признаков/лагов должен выполняться отдельно внутри CV.'
  ] };
}
