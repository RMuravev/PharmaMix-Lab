import type { AlignedPanel } from './panelSourceAlignmentService';
import { applyMarketingCarryover, type CarryoverSettings, type Driver } from './marketingCarryoverOptimizationService';
import { applyMarketingHill, type HillSettings } from './marketingHillCvService';
import { buildPanelDesignMatrix } from './panelDesignMatrixService';
import type { TemporalMmmFit } from './temporalMmmTrainingService';

export interface TrajectoryEffect {
  period: string; brand: string; region: string; chain: string;
  driver: Driver; predictedWithRub: number; predictedWithoutRub: number;
  incrementalRub: number;
}
export interface TrajectoryCounterfactualResult { effects: TrajectoryEffect[]; warnings: string[] }
const drivers: Driver[] = ['tvTrp', 'weightedVisits', 'bonusEstimateRub'];
const id = (p: {period:string;brand:string;region:string;chain:string}) => JSON.stringify([p.period,p.brand,p.region,p.chain]);
/**
 * Recomputes the COMPLETE historical trajectory from raw exposures, rather than
 * zeroing the final transformed feature. The full observed calendar is required:
 * gaps must not silently become zero. Uses fixed, already-trained coefficients.
 * This is a model-based conditional scenario, not an identified causal effect.
 */
export function calculateMarketingTrajectoryCounterfactuals(
  rawPanels: AlignedPanel[],
  fit: Pick<TemporalMmmFit, 'featureNames' | 'coefficients'>,
  carryover: CarryoverSettings, hill: HillSettings,
  options: {start: string; end: string; drivers?: Driver[]; trainMean?: number[]; trainStd?: number[]; interventionStart?: string}
): TrajectoryCounterfactualResult {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(options.start) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(options.end) || options.start > options.end) throw new Error('Некорректный период расчёта.');
  if (options.interventionStart !== undefined &&
      (!/^\d{4}-(0[1-9]|1[0-2])$/.test(options.interventionStart) || options.interventionStart > options.end))
    throw new Error('Некорректный месяц начала контрфактического вмешательства.');
  const chosen = options.drivers ?? drivers;
  if (!chosen.length || new Set(chosen).size !== chosen.length || chosen.some(d=>!drivers.includes(d))) throw new Error('Некорректные драйверы.');
  const names = fit.featureNames;
  if (!names.length || new Set(names).size !== names.length || names.some(n=>![...drivers,'marketRevenueRub'].includes(n)) || fit.coefficients.length !== names.length+1 || !fit.coefficients.every(Number.isFinite)) throw new Error('Некорректная спецификация обученной MMM.');
  if (chosen.some(d=>!names.includes(d))) throw new Error('Драйвер отсутствует в обученной модели.');
  const standardized = options.trainMean !== undefined || options.trainStd !== undefined;
  if (standardized && (!options.trainMean || !options.trainStd || options.trainMean.length !== names.length || options.trainStd.length !== names.length || !options.trainMean.every(Number.isFinite) || !options.trainStd.every(v=>Number.isFinite(v)&&v>=0))) throw new Error('Некорректные параметры train-нормализации.');
  if (!rawPanels.length) throw new Error('Нет исходной истории воздействий.');
  const seen = new Set<string>();
  for (const p of rawPanels) {
    if (seen.has(id(p))) throw new Error(`Дубликат панели ${id(p)}.`);
    seen.add(id(p));
    if (p.period > options.end) throw new Error('Исходная история содержит будущие периоды после конца оценки.');
  }
  const transform = (panels: AlignedPanel[]) => {
    const matrix = buildPanelDesignMatrix(applyMarketingHill(applyMarketingCarryover(panels,carryover),hill));
    if (matrix.errors.length) throw new Error(matrix.errors.join('; '));
    return new Map(matrix.rows.map(r=>[id(r),r]));
  };
  const factual = transform(rawPanels);
  const effects: TrajectoryEffect[] = [];
  const predict = (r: ReturnType<typeof buildPanelDesignMatrix>['rows'][number]) => {
    const values = names.map((name,i)=>{
      const value = r.features[name as keyof typeof r.features];
      if (value === null || !Number.isFinite(value)) return null;
      return standardized ? (value! - options.trainMean![i])/(options.trainStd![i] || 1) : value;
    });
    if (values.some(v=>v===null)) return null;
    const log = fit.coefficients[0] + values.reduce<number>((sum,v,i)=>sum + v!*fit.coefficients[i+1],0);
    const predicted = Math.exp(log);
    if (!Number.isFinite(predicted)) throw new Error('Переполнение прогноза.');
    return predicted;
  };
  for (const driver of chosen) {
    // Preserve the observed pre-intervention history to retain lag/adstock carryover.
    // Without interventionStart, retain the legacy never-treated scenario.
    const zero = rawPanels.map(p=>({...p,[driver]:
      options.interventionStart === undefined || p.period >= options.interventionStart ? 0 : p[driver]}));
    const counterfactual = transform(zero);
    for (const p of rawPanels) {
      if (p.period < options.start || p.period > options.end) continue;
      const withRow=factual.get(id(p)), withoutRow=counterfactual.get(id(p));
      if (!withRow || !withoutRow) continue; // incomplete historical carryover
      const withRub=predict(withRow), withoutRub=predict(withoutRow);
      if (withRub===null || withoutRub===null) continue;
      effects.push({period:p.period,brand:p.brand,region:p.region,chain:p.chain,driver,
        predictedWithRub:withRub,predictedWithoutRub:withoutRub,incrementalRub:withRub-withoutRub});
    }
  }
  if (!effects.length) throw new Error('Нет допустимых прогнозов: проверьте непрерывность исторических воздействий и параметры adstock.');
  return {effects,warnings:[
    'Оценки являются условными прогнозами обученной MMM, а не идентифицированными причинными эффектами.',
    'Для корректного adstock необходима полная история до начала окна; усечённая история может исключить наблюдения.',
    options.interventionStart ? `Контрфактическое вмешательство начинается с ${options.interventionStart}; более ранний adstock сохраняется.` : 'Контрфактический сценарий исключает воздействие за всю доступную историю.',
    'Эффекты отдельных драйверов не обязаны суммироваться в нелинейной модели.',
    'Для сопоставления с ATT необходимо агрегировать эффекты только по реально подвергавшимся воздействию единицам и месяцам.',
    'Логарифмический прогноз exp(E[log Y]) не содержит поправки на смещение среднего.'
  ]};
}
