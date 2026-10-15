import type { TemporalDatasetResult } from './temporalModelDatasetService';

export interface MmmRollingFold { trainEnd: string; testPeriod: string; trainRows: number; testRows: number; trainMean: number; testMean: number; meanRatio: number | null; warning?: string; }
export interface MmmRollingCvReport { folds: MmmRollingFold[]; valid: boolean; warnings: string[]; limitations: string[]; }

/** Leakage-safe descriptive rolling stability diagnostic; it never refits or changes MMM formulas. */
export function rollingMmmStability(data: TemporalDatasetResult, minTrainPeriods = 6): MmmRollingCvReport {
  if (!Number.isInteger(minTrainPeriods) || minTrainPeriods < 2) throw new Error('minTrainPeriods должен быть целым числом не меньше 2.');
  const periods = [...new Set([...data.train, ...data.test].map(r => r.period))].sort();
  const rows = [...data.train, ...data.test];
  const folds: MmmRollingFold[] = [];
  for (let i = minTrainPeriods; i < periods.length; i++) {
    const trainPeriods = new Set(periods.slice(0, i)); const testPeriod = periods[i];
    const train = rows.filter(r => trainPeriods.has(r.period)); const test = rows.filter(r => r.period === testPeriod);
    if (!test.length) continue;
    const trainMean = train.reduce((s, r) => s + r.actualRevenueRub, 0) / train.length;
    const testMean = test.reduce((s, r) => s + r.actualRevenueRub, 0) / test.length;
    folds.push({ trainEnd: periods[i - 1], testPeriod, trainRows: train.length, testRows: test.length, trainMean, testMean, meanRatio: trainMean > 0 ? testMean / trainMean : null, warning: test.some(r => !Number.isFinite(r.actualRevenueRub)) ? 'Некорректное test значение.' : undefined });
  }
  const warnings: string[] = [];
  if (!folds.length) warnings.push('Недостаточно временных периодов для rolling validation.');
  if (folds.some(f => f.meanRatio !== null && (f.meanRatio > 2 || f.meanRatio < .5))) warnings.push('На временных folds обнаружен сильный drift средней выручки.');
  return { folds, valid: folds.length > 0 && !warnings.some(w => w.includes('Недостаточно')), warnings, limitations: ['Rolling mean stability — диагностический proxy, не оценка causal effect.', 'Коэффициентная stability требует сохранённых fit по каждому fold; этот отчёт не переобучает MMM.'] };
}
