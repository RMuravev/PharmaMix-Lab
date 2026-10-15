import { calculateRegressionDiagnostics, type RegressionDiagnostics } from './regressionDiagnosticsService';
import type { TemporalDatasetResult, PreparedObservation } from './temporalModelDatasetService';

export interface TemporalMmmFit {
  model: 'ols' | 'ridge';
  lambda: number;
  featureNames: string[];
  coefficients: number[]; // intercept first, followed by coefficients on prepared feature scale
  testPredictions: { period: string; panelKey: string; actualRevenueRub: number; predictedRevenueRub: number }[];
  diagnostics: RegressionDiagnostics;
  warnings: string[];
}

/** Gaussian elimination with partial pivoting; returns null for singular systems. */
function solve(a: number[][], b: number[]): number[] | null {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);
  for (let k = 0; k < n; k++) {
    let pivot = k;
    for (let i = k + 1; i < n; i++) if (Math.abs(m[i][k]) > Math.abs(m[pivot][k])) pivot = i;
    if (Math.abs(m[pivot][k]) < 1e-11) return null;
    [m[k], m[pivot]] = [m[pivot], m[k]];
    const scale = m[k][k];
    for (let j = k; j <= n; j++) m[k][j] /= scale;
    for (let i = 0; i < n; i++) if (i !== k) {
      const factor = m[i][k];
      for (let j = k; j <= n; j++) m[i][j] -= factor * m[k][j];
    }
  }
  return m.map(row => row[n]);
}

/** Fits log(revenue) using training observations only, evaluates in original ruble units on held-out months. */
export function trainTemporalMmm(dataset: TemporalDatasetResult, options: { model: 'ols' | 'ridge'; lambda?: number }): TemporalMmmFit {
  if (dataset.errors.length) throw new Error(`Нельзя обучать MMM: ${dataset.errors.join('; ')}`);
  const { train, test, featureNames } = dataset;
  const p = featureNames.length;
  if (!train.length || !test.length || train.length <= p + 1) throw new Error('Недостаточно train/test наблюдений для обучения модели.');
  const lambda = options.model === 'ridge' ? (options.lambda ?? 1) : 0;
  if (!Number.isFinite(lambda) || lambda < 0) throw new Error('lambda должна быть конечным неотрицательным числом.');
  const validate = (r: PreparedObservation) => r.x.length === p && r.x.every(Number.isFinite) && Number.isFinite(r.actualRevenueRub) && r.actualRevenueRub > 0;
  if (![...train, ...test].every(validate)) throw new Error('Некорректные факторы или выручка в train/test.');
  if (train.some(r => test.some(t => r.period >= t.period))) throw new Error('Обнаружена утечка: train должен предшествовать test.');
  const d = p + 1;
  const gram = Array.from({ length: d }, () => Array<number>(d).fill(0));
  const rhs = Array<number>(d).fill(0);
  for (const r of train) {
    const x = [1, ...r.x], y = Math.log(r.actualRevenueRub);
    for (let i = 0; i < d; i++) {
      rhs[i] += x[i] * y;
      for (let j = 0; j < d; j++) gram[i][j] += x[i] * x[j];
    }
  }
  for (let i = 1; i < d; i++) gram[i][i] += lambda; // never penalize intercept
  const coefficients = solve(gram, rhs);
  if (!coefficients) throw new Error('Матрица регрессоров вырождена. Попробуйте Ridge или исключите коллинеарные факторы.');
  const testPredictions = test.map(r => {
    const logPrediction = coefficients[0] + r.x.reduce((s, v, i) => s + v * coefficients[i + 1], 0);
    const predictedRevenueRub = Math.exp(logPrediction);
    if (!Number.isFinite(predictedRevenueRub)) throw new Error('Прогноз переполнен: проверьте масштаб факторов.');
    return { period: r.period, panelKey: r.panelKey, actualRevenueRub: r.actualRevenueRub, predictedRevenueRub };
  });
  const diagnostics = calculateRegressionDiagnostics({
    actual: testPredictions.map(r => r.actualRevenueRub),
    predicted: testPredictions.map(r => r.predictedRevenueRub), predictorCount: p
  });
  return { model: options.model, lambda, featureNames: [...featureNames], coefficients, testPredictions, diagnostics,
    warnings: [...dataset.warnings, 'Прогноз exp(log(y)) является оценкой медианы при логнормальных ошибках; поправка на смещение среднего не применяется.',
      'Подбор lambda, признаков и лагов должен выполняться только внутри train; OOS test нельзя использовать для настройки.'] };
}
