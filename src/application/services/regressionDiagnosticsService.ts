export interface RegressionDiagnosticsInput {
  actual: number[];
  predicted: number[];
  /** Number of fitted predictors, excluding intercept. */
  predictorCount?: number;
}

export interface RegressionDiagnostics {
  observations: number;
  mae: number;
  rmse: number;
  mapePct: number | null;
  wapePct: number | null;
  rSquared: number | null;
  adjustedRSquared: number | null;
  excludedZeroActualForMape: number;
  warnings: string[];
}

/**
 * Computes descriptive out-of-sample or in-sample regression diagnostics.
 * This deliberately does not infer coefficient significance: that requires a
 * fitted model's covariance/standard errors and the correct degrees of freedom.
 */
export function calculateRegressionDiagnostics(input: RegressionDiagnosticsInput): RegressionDiagnostics {
  const { actual, predicted } = input;
  const predictorCount = input.predictorCount ?? 0;
  if (!Array.isArray(actual) || !Array.isArray(predicted) || actual.length !== predicted.length) {
    throw new Error('actual и predicted должны быть массивами одинаковой длины.');
  }
  if (!Number.isInteger(predictorCount) || predictorCount < 0) {
    throw new Error('predictorCount должен быть целым неотрицательным числом.');
  }
  if (actual.length === 0) throw new Error('Нельзя рассчитать диагностику без наблюдений.');
  if (actual.some((x) => !Number.isFinite(x)) || predicted.some((x) => !Number.isFinite(x))) {
    throw new Error('Данные actual/predicted должны содержать только конечные числа.');
  }

  const n = actual.length;
  const mean = actual.reduce((sum, x) => sum + x, 0) / n;
  let absError = 0;
  let squaredError = 0;
  let absoluteActual = 0;
  let absoluteErrorForWape = 0;
  let percentageErrorSum = 0;
  let mapeCount = 0;
  let excludedZeroActualForMape = 0;
  let residualSumSquares = 0;
  let totalSumSquares = 0;

  for (let i = 0; i < n; i += 1) {
    const error = actual[i] - predicted[i];
    const abs = Math.abs(error);
    absError += abs;
    squaredError += error * error;
    absoluteActual += Math.abs(actual[i]);
    absoluteErrorForWape += abs;
    residualSumSquares += error * error;
    totalSumSquares += (actual[i] - mean) ** 2;
    if (actual[i] === 0) excludedZeroActualForMape += 1;
    else {
      percentageErrorSum += abs / Math.abs(actual[i]);
      mapeCount += 1;
    }
  }

  const warnings: string[] = [];
  if (excludedZeroActualForMape > 0) warnings.push(`MAPE исключил ${excludedZeroActualForMape} наблюдений с нулевым фактом.`);
  if (totalSumSquares === 0) warnings.push('R² не определён: фактические значения не меняются.');
  if (n <= predictorCount + 1) warnings.push('Скорректированный R² не определён: недостаточно наблюдений относительно числа предикторов.');
  if (absoluteActual === 0) warnings.push('WAPE не определён: сумма абсолютных фактических значений равна нулю.');

  const rSquared = totalSumSquares > 0 ? 1 - residualSumSquares / totalSumSquares : null;
  const adjustedRSquared = rSquared !== null && n > predictorCount + 1
    ? 1 - (1 - rSquared) * (n - 1) / (n - predictorCount - 1)
    : null;

  return {
    observations: n,
    mae: absError / n,
    rmse: Math.sqrt(squaredError / n),
    mapePct: mapeCount > 0 ? percentageErrorSum / mapeCount * 100 : null,
    wapePct: absoluteActual > 0 ? absoluteErrorForWape / absoluteActual * 100 : null,
    rSquared,
    adjustedRSquared,
    excludedZeroActualForMape,
    warnings,
  };
}
