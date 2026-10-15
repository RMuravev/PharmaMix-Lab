/** Cohort-time observational ATT with never-/not-yet-treated controls.
 * First treatment is an absorbing cohort definition, not proof exposure persists.
 * Uses changes from g-1 to t; controls must remain untreated through t.
 */
import { buildCompleteExposurePanel, type ExposurePanelInput } from './completeExposurePanelService';
export type StaggeredDriver = 'promoActive' | 'weightedVisits';
export interface StaggeredOptions {
  eligibleUnits: string[]; calendar: string[]; driver: StaggeredDriver;
  outcome?: 'salesRub' | 'salesUnits'; minControls?: number;
  /** Limit reporting horizon; never use future outcomes for matching. */
  maxEventMonths?: number;
}
export interface CohortTimeEffect {
  cohort: string; period: string; eventMonth: number;
  treatedUnits: number; controlUnits: number;
  att: number; counterfactualMean: number; relativeAttPct: number | null;
}
export interface StaggeredResult {
  effects: CohortTimeEffect[];
  eventStudy: { eventMonth: number; att: number; treatedUnits: number; cohorts: number }[];
  firstTreatment: Record<string, string | null>;
  warnings: string[];
}
const mean = (xs: number[]) => xs.reduce((a,b)=>a+b,0)/xs.length;
export function estimateStaggeredCausalLift(inputs: ExposurePanelInput[], opts: StaggeredOptions): StaggeredResult {
  const { eligibleUnits, driver } = opts;
  const calendar = [...opts.calendar].sort();
  if (driver !== 'promoActive' && driver !== 'weightedVisits') throw new Error('Неизвестный драйвер воздействия.');
  const outcome = opts.outcome ?? 'salesRub';
  if (outcome !== 'salesRub' && outcome !== 'salesUnits') throw new Error('Неизвестный показатель продаж.');
  const minControls = opts.minControls ?? 1;
  const maxEventMonths = opts.maxEventMonths ?? calendar.length;
  if (!Number.isSafeInteger(minControls) || minControls < 1 || !Number.isSafeInteger(maxEventMonths) || maxEventMonths < 0)
    throw new Error('Некорректные настройки анализа когорт.');
  const panel = buildCompleteExposurePanel(inputs, { eligibleUnits, calendar });
  const rows = new Map(panel.rows.map(r => [JSON.stringify([r.unitId,r.period]),r] as const));
  const value = (unit:string, period:string) => rows.get(JSON.stringify([unit,period]))![outcome];
  const firstTreatment: Record<string,string|null> = {};
  for (const unit of eligibleUnits) firstTreatment[unit] = calendar.find(period => rows.get(JSON.stringify([unit,period]))![driver] > 0) ?? null;
  const cohorts = [...new Set(Object.values(firstTreatment).filter((x):x is string=>x!==null))].sort();
  const effects: CohortTimeEffect[] = [];
  const warnings = [...panel.warnings, 'Оценка наблюдательная: нужны условные параллельные тренды, отсутствие anticipation и интерференции между единицами.', 'Первое воздействие задаёт когорту; повторные включения/выключения и одновременные другие кампании требуют отдельного анализа.', 'Доверительные интервалы и формальный тест предтрендов в этом сервисе пока не реализованы.'];
  for (const cohort of cohorts) {
    const startIndex = calendar.indexOf(cohort);
    if (startIndex === 0) { warnings.push(`Когорта ${cohort}: отсутствует период до первого воздействия.`); continue; }
    const treated = eligibleUnits.filter(unit => firstTreatment[unit] === cohort);
    const baselinePeriod = calendar[startIndex-1];
    for (let idx = startIndex; idx < calendar.length && idx-startIndex<=maxEventMonths; idx++) {
      const period = calendar[idx];
      const controls = eligibleUnits.filter(unit => firstTreatment[unit]===null || firstTreatment[unit]! > period);
      if (controls.length < minControls) { warnings.push(`Когорта ${cohort}, ${period}: недостаточно ещё не подвергавшихся воздействию контролей.`); continue; }
      const treatedBefore = mean(treated.map(u=>value(u,baselinePeriod)));
      const treatedNow = mean(treated.map(u=>value(u,period)));
      const controlChange = mean(controls.map(u=>value(u,period)-value(u,baselinePeriod)));
      const counterfactualMean = treatedBefore + controlChange;
      const att = treatedNow - counterfactualMean;
      effects.push({cohort,period,eventMonth:idx-startIndex,treatedUnits:treated.length,controlUnits:controls.length,att,counterfactualMean,relativeAttPct:counterfactualMean>0?100*att/counterfactualMean:null});
    }
  }
  const eventStudy = [...new Set(effects.map(x=>x.eventMonth))].sort((a,b)=>a-b).map(eventMonth=>{
    const group = effects.filter(x=>x.eventMonth===eventMonth);
    const weight = group.reduce((sum,x)=>sum+x.treatedUnits,0);
    return {eventMonth,att:group.reduce((sum,x)=>sum+x.att*x.treatedUnits,0)/weight,treatedUnits:weight,cohorts:group.length};
  });
  if (!effects.length) warnings.push('Нет идентифицируемых когортно-временных эффектов с доступными контролями.');
  return {effects,eventStudy,firstTreatment,warnings};
}
