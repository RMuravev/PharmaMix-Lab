import type { AlignedPanel } from './panelSourceAlignmentService';
import { optimizeMarketingCarryover } from './marketingCarryoverOptimizationService';
import { optimizeMarketingHill, type HillSettings } from './marketingHillCvService';

export interface HillStabilityWindow { trainEnd: string; settings: HillSettings; cvWapePct: number; }
export interface HillDriverStability { driver: keyof HillSettings; ec50Values: number[]; slopeValues: number[]; ec50Ratio: number | null; slopeRange: number; stable: boolean; }
export interface HillStabilityReport { windows: HillStabilityWindow[]; drivers: HillDriverStability[]; warnings: string[]; }
/** Re-estimates carryover and Hill on progressively expanding TRAIN histories only.
 * Stability thresholds are descriptive heuristics, not confidence intervals.
 */
export function assessMarketingHillStability(panels: AlignedPanel[], options: {
  testStart: string; testEnd: string; windowCount?: number; stepMonths?: number;
  lambdas?: number[]; maxCandidates?: number;
  onProgress?: (completed: number, total: number) => void;
}): HillStabilityReport {
  const count = options.windowCount ?? 3, step = options.stepMonths ?? 2;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(options.testStart) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(options.testEnd) || options.testEnd < options.testStart)
    throw new Error('Некорректное тестовое окно.');
  if (!Number.isInteger(count) || count < 2 || count > 12 || !Number.isInteger(step) || step < 1)
    throw new Error('Некорректные параметры окон стабильности.');
  const months = [...new Set(panels.map(p => p.period).filter(p => p.period < options.testStart))].sort();
  const windows: HillStabilityWindow[] = [], warnings: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const index = months.length - i * step;
    if (index < 1) { warnings.push(`Окно ${count-i}: недостаточно истории.`); options.onProgress?.(count-i,count); continue; }
    const trainEnd = months[index-1];
    const eligible = panels.filter(p => p.period <= trainEnd);
    const date = new Date(`${trainEnd}-01T00:00:00Z`);
    date.setUTCMonth(date.getUTCMonth()+1);
    const boundary = `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}`;
    try {
      const carry = optimizeMarketingCarryover(eligible, {testStart:boundary,testEnd:boundary,lambdas:options.lambdas,maxCandidates:options.maxCandidates});
      const hill = optimizeMarketingHill(eligible, {carryover:carry.best.settings,testStart:boundary,testEnd:boundary,lambda:carry.best.lambda});
      windows.push({trainEnd,settings:hill.settings,cvWapePct:hill.cvWapePct});
    } catch (e) { warnings.push(`Окно до ${trainEnd}: ${e instanceof Error ? e.message : String(e)}`); }
    options.onProgress?.(count-i,count);
  }
  const drivers = (['tvTrp','weightedVisits','bonusEstimateRub'] as const).map(driver => {
    const ec50Values = windows.map(w=>w.settings[driver].halfSaturation);
    const slopeValues = windows.map(w=>w.settings[driver].slope);
    const min = Math.min(...ec50Values), max = Math.max(...ec50Values);
    const ec50Ratio = ec50Values.length && min > 0 ? max/min : null;
    const slopeRange = slopeValues.length ? Math.max(...slopeValues)-Math.min(...slopeValues) : NaN;
    return {driver,ec50Values,slopeValues,ec50Ratio,slopeRange,stable:windows.length>=2 && ec50Ratio!==null && ec50Ratio<=2 && slopeRange<=0.5};
  });
  if (windows.length < 2) warnings.push('Недостаточно успешных окон для оценки стабильности Hill.');
  for (const d of drivers) if (windows.length>=2 && !d.stable) warnings.push(`Hill ${d.driver} чувствителен к периоду обучения.`);
  warnings.push('Критерии EC50 ratio ≤ 2 и slope range ≤ 0.5 являются эвристическими; стабильность не доказывает причинность.');
  return {windows,drivers,warnings};
}
