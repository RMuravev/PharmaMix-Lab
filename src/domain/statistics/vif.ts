import { ols } from './ols';

const DIAGNOSTIC_FEATURES = new Set(['logTRP', 'bonusIdx', 'logVisits', 'logMkt', 'trend']);

/** Variance inflation factors for the current MMM continuous drivers. */
export function calculateVif(design: number[][], names: string[]): Record<string, number> {
  const result: Record<string, number> = {};
  names.forEach((name, column) => {
    if (!DIAGNOSTIC_FEATURES.has(name)) return;
    try {
      const outcome = design.map(row => row[column]);
      const otherColumns = design.map(row => row.filter((_, index) => index !== column));
      const fit = ols(otherColumns, outcome);
      result[name] = fit.r2 < 0.999999 ? 1 / (1 - fit.r2) : Infinity;
    } catch {
      result[name] = Infinity;
    }
  });
  return result;
}
