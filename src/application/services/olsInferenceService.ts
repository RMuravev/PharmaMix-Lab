export interface OlsInferenceInput {
  /** Design matrix including the intercept column, if the model has one. */
  designMatrix: number[][];
  actual: number[];
  coefficientNames?: string[];
  confidenceLevel?: 0.9 | 0.95 | 0.99;
}

export interface OlsCoefficientInference {
  name: string;
  estimate: number;
  standardError: number | null;
  tStatistic: number | null;
  confidenceInterval: [number, number] | null;
  significantAtLevel: boolean | null;
}

export interface OlsInferenceResult {
  observations: number;
  parameters: number;
  degreesOfFreedom: number;
  residualVariance: number | null;
  confidenceLevel: number;
  coefficients: OlsCoefficientInference[];
  warnings: string[];
}

// Two-sided Student-t critical values; interpolation is intentionally avoided.
const T95: Record<number, number> = { 1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571, 6: 2.447, 7: 2.365, 8: 2.306, 9: 2.262, 10: 2.228, 15: 2.131, 20: 2.086, 30: 2.042, 40: 2.021, 60: 2.000, 120: 1.980, 1000000: 1.960 };
const T90: Record<number, number> = { 1: 6.314, 2: 2.920, 3: 2.353, 4: 2.132, 5: 2.015, 6: 1.943, 7: 1.895, 8: 1.860, 9: 1.833, 10: 1.812, 15: 1.753, 20: 1.725, 30: 1.697, 40: 1.684, 60: 1.671, 120: 1.658, 1000000: 1.645 };
const T99: Record<number, number> = { 1: 63.657, 2: 9.925, 3: 5.841, 4: 4.604, 5: 4.032, 6: 3.707, 7: 3.499, 8: 3.355, 9: 3.250, 10: 3.169, 15: 2.947, 20: 2.845, 30: 2.750, 40: 2.704, 60: 2.660, 120: 2.617, 1000000: 2.576 };

function criticalT(df: number, level: number): number {
  const table = level === 0.9 ? T90 : level === 0.99 ? T99 : T95;
  const keys = Object.keys(table).map(Number).sort((a, b) => a - b);
  const conservativeKey = [...keys].reverse().find((k) => k <= df) ?? keys[0];
  return table[conservativeKey];
}

function invert(matrix: number[][]): number[][] | null {
  const n = matrix.length;
  const a = matrix.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => i === j ? 1 : 0)]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    if (Math.abs(a[pivot][col]) < 1e-12) return null;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    const divisor = a[col][col];
    a[col] = a[col].map((v) => v / divisor);
    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = a[row][col];
      a[row] = a[row].map((v, j) => v - factor * a[col][j]);
    }
  }
  return a.map((row) => row.slice(n));
}

/** Classical OLS inference under homoskedastic, independent errors. Not HAC/Newey-West. */
export function calculateOlsInference(input: OlsInferenceInput): OlsInferenceResult {
  const { designMatrix, actual } = input;
  const confidenceLevel = input.confidenceLevel ?? 0.95;
  if (![0.9, 0.95, 0.99].includes(confidenceLevel)) throw new Error('confidenceLevel должен быть 0.9, 0.95 или 0.99.');
  if (!Array.isArray(designMatrix) || !Array.isArray(actual) || designMatrix.length !== actual.length || actual.length === 0) throw new Error('Матрица признаков и фактические значения должны иметь одинаковую ненулевую длину.');
  const p = designMatrix[0]?.length ?? 0;
  if (p === 0 || designMatrix.some((row) => !Array.isArray(row) || row.length !== p || row.some((v) => !Number.isFinite(v))) || actual.some((v) => !Number.isFinite(v))) throw new Error('Матрица и факт должны содержать конечные числа одинаковой размерности.');
  const n = actual.length;
  const df = n - p;
  const warnings: string[] = [];
  if (df <= 0) return { observations: n, parameters: p, degreesOfFreedom: df, residualVariance: null, confidenceLevel, coefficients: Array.from({ length: p }, (_, j) => ({ name: input.coefficientNames?.[j] ?? `x${j}`, estimate: NaN, standardError: null, tStatistic: null, confidenceInterval: null, significantAtLevel: null })), warnings: ['Недостаточно наблюдений: число параметров должно быть меньше числа наблюдений.'] };
  const xtx = Array.from({ length: p }, (_, j) => Array.from({ length: p }, (_, k) => designMatrix.reduce((s, row) => s + row[j] * row[k], 0)));
  const inverse = invert(xtx);
  if (!inverse) return { observations: n, parameters: p, degreesOfFreedom: df, residualVariance: null, confidenceLevel, coefficients: Array.from({ length: p }, (_, j) => ({ name: input.coefficientNames?.[j] ?? `x${j}`, estimate: NaN, standardError: null, tStatistic: null, confidenceInterval: null, significantAtLevel: null })), warnings: ['Матрица XᵀX вырождена: коэффициенты и их значимость не определены. Проверьте мультиколлинеарность.'] };
  const xty = Array.from({ length: p }, (_, j) => designMatrix.reduce((s, row, i) => s + row[j] * actual[i], 0));
  const beta = inverse.map((row) => row.reduce((s, value, j) => s + value * xty[j], 0));
  const residuals = actual.map((y, i) => y - designMatrix[i].reduce((s, x, j) => s + x * beta[j], 0));
  const variance = residuals.reduce((s, r) => s + r * r, 0) / df;
  const critical = criticalT(df, confidenceLevel);
  const coefficients = beta.map((estimate, j) => {
    const se2 = variance * inverse![j][j];
    const standardError = se2 >= 0 ? Math.sqrt(se2) : NaN;
    const valid = Number.isFinite(standardError) && standardError > 0;
    const tStatistic = valid ? estimate / standardError : null;
    return { name: input.coefficientNames?.[j] ?? `x${j}`, estimate, standardError: valid ? standardError : null, tStatistic, confidenceInterval: valid ? [estimate - critical * standardError, estimate + critical * standardError] as [number, number] : null, significantAtLevel: valid ? Math.abs(tStatistic!) > critical : null };
  });
  if (n < 30) warnings.push('Мало наблюдений: выводы о значимости могут быть нестабильны.');
  warnings.push('Обычные OLS-ошибки предполагают независимые гомоскедастичные остатки; для временных рядов проверьте автокорреляцию и рассмотрите HAC/Newey–West.');
  warnings.push('Значимость не доказывает причинный эффект; учитывайте сезонность, тренд, эндогенность и множественные проверки.');
  return { observations: n, parameters: p, degreesOfFreedom: df, residualVariance: variance, confidenceLevel, coefficients, warnings };
}
