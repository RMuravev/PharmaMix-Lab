/** Newey–West HAC covariance estimator with Bartlett weights (OLS design matrix supplied by caller). */
export interface NeweyWestInput {
  design: number[][];
  residuals: number[];
  /** Maximum lag in the Bartlett kernel; must be >= 0 and < n. */
  maxLag: number;
  /** Apply the finite-sample n/(n-k) correction. Defaults to true. */
  finiteSampleCorrection?: boolean;
}
export interface NeweyWestResult {
  observations: number;
  parameters: number;
  maxLag: number;
  covariance: number[][];
  standardErrors: number[];
  warnings: string[];
}
function invert(a: number[][]): number[][] | null {
  const n = a.length;
  const m = a.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => i === j ? 1 : 0)]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    if (Math.abs(m[pivot][col]) < 1e-12) return null;
    [m[col], m[pivot]] = [m[pivot], m[col]];
    const divisor = m[col][col];
    for (let j = 0; j < 2 * n; j++) m[col][j] /= divisor;
    for (let r = 0; r < n; r++) if (r !== col) {
      const factor = m[r][col];
      for (let j = 0; j < 2 * n; j++) m[r][j] -= factor * m[col][j];
    }
  }
  return m.map(row => row.slice(n));
}
function multiply(a: number[][], b: number[][]): number[][] {
  return a.map(row => b[0].map((_, j) => row.reduce((sum, value, k) => sum + value * b[k][j], 0)));
}
export function calculateNeweyWest(input: NeweyWestInput): NeweyWestResult {
  const { design, residuals, maxLag } = input;
  if (!Array.isArray(design) || !Array.isArray(residuals) || design.length !== residuals.length || design.length === 0)
    throw new Error('design и residuals должны иметь одинаковое положительное число строк.');
  if (!Number.isInteger(maxLag) || maxLag < 0 || maxLag >= design.length) throw new Error('maxLag должен быть целым числом от 0 до n−1.');
  const k = design[0]?.length ?? 0, n = design.length;
  if (!k || design.some(row => !Array.isArray(row) || row.length !== k || row.some(x => !Number.isFinite(x))) || residuals.some(x => !Number.isFinite(x)))
    throw new Error('Матрица design должна быть прямоугольной и содержать только конечные числа; остатки также должны быть конечными.');
  const xtx = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => design.reduce((s, row) => s + row[i] * row[j], 0)));
  const bread = invert(xtx);
  if (!bread) throw new Error('XᵀX вырождена: HAC-ковариацию вычислить нельзя.');
  const meat = Array.from({ length: k }, () => Array(k).fill(0));
  // Lag zero: sum_t (x_t e_t)(x_t e_t)ᵀ.
  for (let t = 0; t < n; t++) for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) meat[i][j] += design[t][i] * residuals[t] * design[t][j] * residuals[t];
  // Bartlett-weighted symmetric lag terms.
  for (let lag = 1; lag <= maxLag; lag++) {
    const weight = 1 - lag / (maxLag + 1);
    for (let t = lag; t < n; t++) for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) {
      const cross = design[t][i] * residuals[t] * design[t - lag][j] * residuals[t - lag];
      meat[i][j] += weight * cross;
      meat[j][i] += weight * cross;
    }
  }
  let covariance = multiply(multiply(bread, meat), bread);
  const warnings: string[] = [];
  if (input.finiteSampleCorrection !== false) {
    if (n <= k) warnings.push('n ≤ число параметров: конечновыборочная поправка не применена.');
    else covariance = covariance.map(row => row.map(value => value * n / (n - k)));
  }
  const standardErrors = covariance.map((row, i) => {
    const variance = row[i];
    if (variance < -1e-10) warnings.push(`Отрицательная диагональная HAC-дисперсия для параметра ${i}; проверьте данные и лаг.`);
    return variance >= 0 ? Math.sqrt(variance) : NaN;
  });
  warnings.push('HAC/Newey–West требует корректного хронологического порядка строк; пропуски времени и панельные группы нужно обрабатывать отдельно.');
  return { observations: n, parameters: k, maxLag, covariance, standardErrors, warnings };
}
