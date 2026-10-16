export interface OlsResult {
  beta: number[];
  fit: number[];
  residuals: number[];
  r2: number;
}

function average(values: readonly number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : Number.NaN;
}

function invert(matrix: number[][]): number[][] | null {
  const n = matrix.length;
  const augmented = matrix.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => i === j ? 1 : 0)]);
  for (let column = 0; column < n; column++) {
    let pivot = column;
    for (let row = column + 1; row < n; row++) if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    if (Math.abs(augmented[pivot][column]) < 1e-14) return null;
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const divisor = augmented[column][column];
    for (let j = 0; j < 2 * n; j++) augmented[column][j] /= divisor;
    for (let row = 0; row < n; row++) if (row !== column) {
      const factor = augmented[row][column];
      if (factor) for (let j = 0; j < 2 * n; j++) augmented[row][j] -= factor * augmented[column][j];
    }
  }
  return augmented.map(row => row.slice(n));
}

/** OLS kernel retained from the current MMM implementation, with only consumed outputs exposed. */
export function ols(design: number[][], outcome: number[]): OlsResult {
  const n = design.length;
  const k = design[0]?.length ?? 0;
  if (outcome.length !== n || n <= k || k === 0 || design.some(row => row.length !== k || row.some(value => !Number.isFinite(value))) || outcome.some(value => !Number.isFinite(value))) {
    throw new Error('Некорректная матрица OLS или недостаточно наблюдений.');
  }
  const scales = Array<number>(k).fill(1);
  for (let j = 0; j < k; j++) {
    let sumSquares = 0;
    for (let i = 0; i < n; i++) sumSquares += design[i][j] * design[i][j];
    const scale = Math.sqrt(sumSquares / n);
    scales[j] = scale > 1e-12 ? scale : 1;
  }
  const normalized = design.map(row => row.map((value, j) => value / scales[j]));
  const gram = Array.from({ length: k }, () => Array<number>(k).fill(0));
  const rhs = Array<number>(k).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < k; j++) {
      rhs[j] += normalized[i][j] * outcome[i];
      for (let l = j; l < k; l++) gram[j][l] += normalized[i][j] * normalized[i][l];
    }
  }
  for (let j = 0; j < k; j++) {
    for (let l = 0; l < j; l++) gram[j][l] = gram[l][j];
    gram[j][j] += 1e-10 * n;
  }
  const inverse = invert(gram);
  if (!inverse) throw new Error('Матрица плана вырождена.');
  const scaledBeta = inverse.map(row => row.reduce((sum, value, j) => sum + value * rhs[j], 0));
  const beta = scaledBeta.map((value, j) => value / scales[j]);
  const fit = normalized.map(row => row.reduce((sum, value, j) => sum + value * scaledBeta[j], 0));
  const residuals = outcome.map((value, i) => value - fit[i]);
  const mean = average(outcome);
  const residualSumSquares = residuals.reduce((sum, value) => sum + value * value, 0);
  const totalSumSquares = outcome.reduce((sum, value) => sum + (value - mean) ** 2, 0);
  return { beta, fit, residuals, r2: totalSumSquares > 0 ? 1 - residualSumSquares / totalSumSquares : Number.NaN };
}
