import type { TemporalDatasetResult } from './temporalModelDatasetService';
import { calculateVIF } from '../../modules/mmm-engine/vifCheck';

export interface MmmDiagnosticsReport {
  valid: boolean; trainRows: number; testRows: number; trainPeriods: number; testPeriods: number;
  overlapPeriods: string[]; trainCoveragePct: number; testCoveragePct: number;
  vif: Record<string, number>; leakage: string[]; warnings: string[]; limitations: string[]; coverageStatus: 'known' | 'unknown';
  trainTestMeanRatio: number | null; sanity: string[];
}

/** Diagnostics only: does not refit MMM or alter adstock/Hill/causal estimands. */
export function diagnoseMmmDataset(data: TemporalDatasetResult, expectedTrainPeriods?: string[], expectedTestPeriods?: string[]): MmmDiagnosticsReport {
  const trainPeriods = [...new Set(data.train.map(r => r.period))].sort();
  const testPeriods = [...new Set(data.test.map(r => r.period))].sort();
  const overlapPeriods = trainPeriods.filter(p => testPeriods.includes(p));
  const leakage: string[] = [];
  if (overlapPeriods.length) leakage.push(`Train/Test пересекаются по месяцам: ${overlapPeriods.join(', ')}.`);
  if (data.train.some(r => !r.period || r.period >= (testPeriods[0] ?? '\uffff'))) leakage.push('Обучающие наблюдения находятся не строго до начала test окна.');
  const warnings = [...data.warnings];
  if (data.train.length < 24) warnings.push(`Мало train наблюдений (${data.train.length}); сезонность и лаги могут быть неидентифицируемы.`);
  if (data.test.length < 6) warnings.push(`Мало test наблюдений (${data.test.length}); OOS метрики нестабильны.`);
  const vifNames = data.featureNames.map(name => ({ tvTrp: 'logTRP', weightedVisits: 'logVisits', bonusEstimateRub: 'bonusIdx', marketRevenueRub: 'logMkt' } as Record<string,string>)[name] ?? name);
  const vif = calculateVIF(data.train.map(r => [1, ...r.x]), ['const', ...vifNames]);
  const high = Object.entries(vif).filter(([, v]) => v > 5 || !Number.isFinite(v));
  if (high.length) warnings.push(`Мультиколлинеарность: ${high.map(([n,v]) => `${n} VIF=${Number.isFinite(v) ? v.toFixed(1) : '∞'}`).join(', ')}.`);
  if (data.train.some(r => r.x.some((_, j) => data.train.every(x => x.x[j] === r.x[j])))) warnings.push('Есть константные факторы в train; коэффициенты неидентифицируемы.');
  const coverageStatus = expectedTrainPeriods && expectedTestPeriods ? 'known' : 'unknown';
  const trainCoveragePct = coverageStatus === 'known' ? trainPeriods.filter(p => expectedTrainPeriods!.includes(p)).length / expectedTrainPeriods!.length * 100 : null;
  const testCoveragePct = coverageStatus === 'known' ? testPeriods.filter(p => expectedTestPeriods!.includes(p)).length / expectedTestPeriods!.length * 100 : null;
  if (coverageStatus === 'unknown') warnings.push('Календарное покрытие неизвестно: declared expected calendar не передан.');
  else if (trainCoveragePct! < 100 || testCoveragePct! < 100) warnings.push('Неполное календарное покрытие train/test; нулевые продажи допустимы только внутри объявленной панели.');
  const mean = (rows: typeof data.train) => rows.length ? rows.reduce((s, r) => s + r.actualRevenueRub, 0) / rows.length : null;
  const trainMean = mean(data.train), testMean = mean(data.test);
  const trainTestMeanRatio = trainMean && testMean ? testMean / trainMean : null;
  const sanity: string[] = [];
  if (trainTestMeanRatio !== null && (trainTestMeanRatio > 2 || trainTestMeanRatio < 0.5)) sanity.push('Средняя test-выручка отличается от train более чем в 2 раза; проверьте drift и окно OOS.');
  return { valid: !data.errors.length && !leakage.length, trainRows: data.train.length, testRows: data.test.length, trainPeriods: trainPeriods.length, testPeriods: testPeriods.length, overlapPeriods, trainCoveragePct: trainCoveragePct ?? NaN, testCoveragePct: testCoveragePct ?? NaN, vif, leakage, warnings, limitations: ['Диагностика не доказывает причинность и не подтверждает бизнес-значимость.', 'VIF и OOS стабильность зависят от выбранной единицы панели и окна.', 'Проверка не заменяет temporal CV, leakage audit признаков и проверку provenance/freshness результата.'], coverageStatus, trainTestMeanRatio, sanity };
}
