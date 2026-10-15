import { calculateNeweyWest } from './neweyWestService';

export interface HacInferenceInput {
  designMatrix: number[][];
  actual: number[];
  coefficientNames?: string[];
  maxLag: number;
  confidenceLevel?: 0.9 | 0.95 | 0.99;
  finiteSampleCorrection?: boolean;
}
export interface HacCoefficientInference {
  name: string;
  estimate: number;
  standardError: number | null;
  tStatistic: number | null;
  confidenceInterval: [number, number] | null;
  significantAtLevel: boolean | null;
}
export interface HacInferenceResult {
  observations: number;
  parameters: number;
  degreesOfFreedom: number;
  maxLag: number;
  confidenceLevel: number;
  coefficients: HacCoefficientInference[];
  warnings: string[];
}

// Conservative tabulated two-sided t critical values; nearest lower df is used.
const CRITICAL: Record<number, Record<number, number>> = {
  0.9: { 1: 6.314, 2: 2.920, 3: 2.353, 4: 2.132, 5: 2.015, 6: 1.943, 7: 1.895, 8: 1.860, 9: 1.833, 10: 1.812, 15: 1.753, 20: 1.725, 30: 1.697, 40: 1.684, 60: 1.671, 120: 1.658, 1000000: 1.645 },
  0.95: { 1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571, 6: 2.447, 7: 2.365, 8: 2.306, 9: 2.262, 10: 2.228, 15: 2.131, 20: 2.086, 30: 2.042, 40: 2.021, 60: 2.000, 120: 1.980, 1000000: 1.960 },
  0.99: { 1: 63.657, 2: 9.925, 3: 5.841, 4: 4.604, 5: 4.032, 6: 3.707, 7: 3.499, 8: 3.355, 9: 3.250, 10: 3.169, 15: 2.947, 20: 2.845, 30: 2.750, 40: 2.704, 60: 2.660, 120: 2.617, 1000000: 2.576 },
};
function criticalT(df: number, level: 0.9 | 0.95 | 0.99): number {
  const table = CRITICAL[level];
  const key = Object.keys(table).map(Number).sort((a, b) => a - b).filter((v) => v <= df).pop() ?? 1;
  return table[key];
}

/**
 * OLS point estimates with Newey–West HAC standard errors and t-based intervals.
 * Rows must already be sorted chronologically and represent equally spaced observations.
 * The intervals are asymptotic/approximate; no p-value is returned to avoid pretending
 * a small-sample exact distribution for HAC statistics.
 */
export function calculateHacInference(input: HacInferenceInput): HacInferenceResult {
  const { designMatrix, actual, maxLag } = input;
  const level = input.confidenceLevel ?? 0.95;
  if (![0.9, 0.95, 0.99].includes(level)) throw new Error('confidenceLevel должен быть 0.9, 0.95 или 0.99.');
  if (!Array.isArray(designMatrix) || !Array.isArray(actual) || designMatrix.length !== actual.length || actual.length === 0)
    throw new Error('Матрица признаков и фактические значения должны иметь одинаковую ненулевую длину.');
  const n = actual.length;
  const k = designMatrix[0]?.length ?? 0;
  if (!k || designMatrix.some((row) => !Array.isArray(row) || row.length !== k || row.some((v) => !Number.isFinite(v))) || actual.some((v) => !Number.isFinite(v)))
    throw new Error('Матрица признаков и факт должны содержать конечные числа и иметь согласованные размерности.');
  const df = n - k;
  const empty = Array.from({ length: k }, (_, j) => ({ name: input.coefficientNames?.[j] ?? `x${j}`, estimate: NaN, standardError: null, tStatistic: null, confidenceInterval: null, significantAtLevel: null } as HacCoefficientInference));
  if (df <= 0) return { observations: n, parameters: k, degreesOfFreedom: df, maxLag, confidenceLevel: level, coefficients: empty, warnings: ['Недостаточно наблюдений: число параметров должно быть меньше числа наблюдений.'] };

  const xtx = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => designMatrix.reduce((s, row) => s + row[i] * row[j], 0)));
  // Gauss-Jordan inverse; pivoting guards against simple singularity.
  const augmented = xtx.map((row, i) => [...row, ...Array.from({ length: k }, (_, j) => Number(i === j))]);
  for (let col = 0; col < k; col++) {
    let pivot = col;
    for (let r = col + 1; r < k; r++) if (Math.abs(augmented[r][col]) > Math.abs(augmented[pivot][col])) pivot = r;
    if (Math.abs(augmented[pivot][col]) < 1e-12) return { observations: n, parameters: k, degreesOfFreedom: df, maxLag, confidenceLevel: level, coefficients: empty, warnings: ['Матрица XᵀX вырождена; HAC-инференция невозможна.'] };
    [augmented[col], augmented[pivot]] = [augmented[pivot], augmented[col]];
    const divisor = augmented[col][col];
    for (let j = 0; j < 2 * k; j++) augmented[col][j] /= divisor;
    for (let r = 0; r < k; r++) if (r !== col) { const factor = augmented[r][col]; for (let j = 0; j < 2 * k; j++) augmented[r][j] -= factor * augmented[col][j]; }
  }
  const inverse = augmented.map((row) => row.slice(k));
  const xty = Array.from({ length: k }, (_, j) => designMatrix.reduce((s, row, i) => s + row[j] * actual[i], 0));
  const beta = inverse.map((row) => row.reduce((s, v, j) => s + v * xty[j], 0));
  const residuals = actual.map((y, i) => y - designMatrix[i].reduce((s, x, j) => s + x * beta[j], 0));
  const hac = calculateNeweyWest({ design: designMatrix, residuals, maxLag, finiteSampleCorrection: input.finiteSampleCorrection });
  const critical = criticalT(df, level as 0.9 | 0.95 | 0.99);
  const coefficients = beta.map((estimate, j): HacCoefficientInference => {
    const se = hac.standardErrors[j];
    if (!Number.isFinite(se) || se <= 0) return { name: input.coefficientNames?.[j] ?? `x${j}`, estimate, standardError: null, tStatistic: null, confidenceInterval: null, significantAtLevel: null };
    const t = estimate / se;
    return { name: input.coefficientNames?.[j] ?? `x${j}`, estimate, standardError: se, tStatistic: t, confidenceInterval: [estimate - critical * se, estimate + critical * se], significantAtLevel: Math.abs(t) > critical };
  });
  const warnings = [...hac.warnings];
  if (n < 30) warnings.push('Меньше 30 наблюдений: HAC-оценки и интервалы могут быть нестабильны.');
  warnings.push('Доверительные интервалы используют табличное t-приближение; это не точные маловыборочные HAC-интервалы. p-value не рассчитывается.');
  return { observations: n, parameters: k, degreesOfFreedom: df, maxLag, confidenceLevel: level, coefficients, warnings };
}
