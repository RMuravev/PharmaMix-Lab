import type { AlignedPanel } from './panelSourceAlignmentService';
import { optimizeMarketingCarryover, type CarryoverSettings } from './marketingCarryoverOptimizationService';

export interface StabilityWindow {
  trainEnd: string;
  observations: number;
  cvWapePct: number;
  lambda: number;
  settings: CarryoverSettings;
}
export interface DriverStability {
  driver: keyof CarryoverSettings;
  lagValues: number[];
  decayValues: number[];
  lagRange: number;
  decayRange: number;
  stable: boolean;
}
export interface StabilityReport {
  windows: StabilityWindow[];
  drivers: DriverStability[];
  warnings: string[];
}
/** Re-fit hyperparameters on progressively longer histories; no OOS months are used.
 * This is a sensitivity check, not a confidence interval or causal identification.
 */
export function assessMarketingParameterStability(panels: AlignedPanel[], options: {
  testStart: string; testEnd: string; windowCount?: number; stepMonths?: number;
  lags?: number[]; decays?: number[]; lambdas?: number[];
  validationMonths?: number; folds?: number; minTrainMonths?: number; maxCandidates?: number;
  onProgress?: (completedWindows: number, totalWindows: number) => void;
}): StabilityReport {
  const windowCount = options.windowCount ?? 3;
  const stepMonths = options.stepMonths ?? 2;
  if (!Number.isInteger(windowCount) || windowCount < 2 || windowCount > 12 || !Number.isInteger(stepMonths) || stepMonths < 1)
    throw new Error('Некорректные параметры окон стабильности.');
  const months = [...new Set(panels.map(p => p.period).filter(p => p < options.testStart))].sort();
  const windows: StabilityWindow[] = [];
  const warnings: string[] = [];
  for (let i = windowCount - 1; i >= 0; i--) {
    const endIndex = months.length - i * stepMonths;
    if (endIndex < 1) { warnings.push(`Окно ${windowCount - i}: недостаточно истории.`); continue; }
    const trainEnd = months[endIndex - 1];
    const eligible = panels.filter(p => p.period <= trainEnd);
    try {
      // A synthetic future boundary ensures optimizer never sees months beyond trainEnd.
      const next = new Date(`${trainEnd}-01T00:00:00Z`);
      next.setUTCMonth(next.getUTCMonth() + 1);
      const boundary = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`;
      const result = optimizeMarketingCarryover(eligible, {
        testStart: boundary, testEnd: boundary,
        lags: options.lags, decays: options.decays, lambdas: options.lambdas,
        validationMonths: options.validationMonths, folds: options.folds,
        minTrainMonths: options.minTrainMonths, maxCandidates: options.maxCandidates,
      });
      windows.push({trainEnd, observations: result.best.observations, cvWapePct: result.best.cvWapePct,
        lambda: result.best.lambda, settings: result.best.settings});
    } catch (error) {
      warnings.push(`Окно до ${trainEnd}: ${error instanceof Error ? error.message : String(error)}`);
    }
    options.onProgress?.(windowCount - i, windowCount);
  }
  const names: (keyof CarryoverSettings)[] = ['tvTrp', 'weightedVisits', 'bonusEstimateRub'];
  const drivers = names.map(driver => {
    const lagValues = windows.map(w => w.settings[driver].lag);
    const decayValues = windows.map(w => w.settings[driver].decay);
    const lagRange = lagValues.length ? Math.max(...lagValues) - Math.min(...lagValues) : NaN;
    const decayRange = decayValues.length ? Math.max(...decayValues) - Math.min(...decayValues) : NaN;
    return {driver, lagValues, decayValues, lagRange, decayRange,
      stable: windows.length >= 2 && lagRange === 0 && decayRange <= 0.2};
  });
  if (windows.length < 2) warnings.push('Недостаточно успешных окон для оценки стабильности.');
  for (const driver of drivers) if (windows.length >= 2 && !driver.stable)
    warnings.push(`Параметры ${driver.driver} чувствительны к периоду обучения (диапазон лага ${driver.lagRange}, decay ${driver.decayRange.toFixed(2)}).`);
  warnings.push('Эвристика стабильности не является статистическим тестом значимости.');
  return {windows, drivers, warnings};
}
