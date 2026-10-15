import type { AlignedPanel } from './panelSourceAlignmentService';
import type { CarryoverSettings } from './marketingCarryoverOptimizationService';
import type { HillSettings } from './marketingHillCvService';
import type { TemporalMmmFit } from './temporalMmmTrainingService';
import type { StaggeredResult } from './staggeredCausalLiftService';
import type { UnitMonthEffect } from './causalMmmPopulationAlignmentService';
import { calculateMarketingTrajectoryCounterfactuals } from './marketingTrajectoryCounterfactualService';
import { aggregateMmmTrajectoryToCausalUnits } from './mmmCausalUnitAggregationService';
import { compareStaggeredAttWithMmm } from './causalMmmAttBridgeService';

/**
 * Cohort-specific intervention starts. Each cohort is evaluated in its own
 * counterfactual world, then ONLY that cohort's treated unit-months are retained.
 * The driver must be separable at its exposure grain; shared exposures across
 * cohorts cannot be independently switched off and must be rejected.
 */
export function compareStaggeredCohortsWithMmm(input: {
  panels: AlignedPanel[];
  fit: Pick<TemporalMmmFit,'featureNames'|'coefficients'>;
  carryover: CarryoverSettings;
  hill: HillSettings;
  causal: Pick<StaggeredResult,'effects'|'firstTreatment'>;
  driver: 'promoActive'|'weightedVisits';
  populationKey: string;
  unitForPanel: (panel: Pick<AlignedPanel,'brand'|'region'|'chain'>) => string|null;
  disjointSalesPanelsVerified: boolean;
  trainMean?: number[];
  trainStd?: number[];
}) {
  if (!input.disjointSalesPanelsVerified) throw new Error('Не подтверждена непересекающаяся детализация продаж.');
  const driver = input.driver === 'promoActive' ? 'bonusEstimateRub' : 'weightedVisits';
  const cohortMonths = new Map<string,Set<string>>();
  for (const e of input.causal.effects) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(e.cohort) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(e.period) || e.period<e.cohort)
      throw new Error('Некорректный период ATT(g,t).');
    if (!cohortMonths.has(e.cohort)) cohortMonths.set(e.cohort,new Set());
    if (cohortMonths.get(e.cohort)!.has(e.period)) throw new Error('Повторная когортно-временная оценка.');
    cohortMonths.get(e.cohort)!.add(e.period);
  }
  if (!cohortMonths.size) throw new Error('Нет ATT(g,t) для расчёта.');
  const unitsByCohort = new Map<string,string[]>();
  for (const [unit,cohort] of Object.entries(input.causal.firstTreatment)) {
    if (cohort !== null && cohortMonths.has(cohort)) {
      if (!unitsByCohort.has(cohort)) unitsByCohort.set(cohort,[]);
      unitsByCohort.get(cohort)!.push(unit);
    }
  }
  // Visits are shared across chains within brand+region; promo is shared only
  // within brand+region+chain. Reject ambiguous cohort membership at this grain.
  const exposureCohorts = new Map<string,string>();
  for (const panel of input.panels) {
    const unit = input.unitForPanel(panel);
    if (unit === null) continue;
    const cohort = input.causal.firstTreatment[unit];
    if (cohort === undefined) throw new Error(`Неизвестная causal-единица: ${unit}.`);
    const exposureKey = JSON.stringify(driver === 'weightedVisits' ? [panel.brand,panel.region] : [panel.brand,panel.region,panel.chain]);
    const cohortLabel = cohort ?? 'never-treated';
    const previous = exposureCohorts.get(exposureKey);
    if (previous !== undefined && previous !== cohortLabel)
      throw new Error('Общее воздействие используется единицами разных когорт: независимый контрфакт невозможен.');
    exposureCohorts.set(exposureKey,cohortLabel);
  }
  const all: UnitMonthEffect[]=[];
  const warnings:string[]=[];
  for (const [cohort,months] of [...cohortMonths].sort(([a],[b])=>a.localeCompare(b))) {
    const units = unitsByCohort.get(cohort) ?? [];
    if (!units.length) throw new Error(`Нет единиц для когорты ${cohort}.`);
    const periods=[...months].sort();
    const trajectory=calculateMarketingTrajectoryCounterfactuals(input.panels,input.fit,input.carryover,input.hill,{
      start:periods[0],end:periods[periods.length-1],interventionStart:cohort,
      drivers:[driver],trainMean:input.trainMean,trainStd:input.trainStd,
    });
    const allowed=new Set(units);
    const effects=trajectory.effects.filter(e=>{
      const unit=input.unitForPanel(e);
      return unit!==null && allowed.has(unit);
    });
    const expectedUnitMonths=units.flatMap(unitId=>periods.map(period=>({unitId,period})));
    all.push(...aggregateMmmTrajectoryToCausalUnits({effects,driver,unitForPanel:input.unitForPanel,
      expectedUnitMonths,disjointSalesPanelsVerified:input.disjointSalesPanelsVerified}));
    warnings.push(`Когорта ${cohort}: пересчитана история воздействий с сохранением pre-treatment adstock.`);
  }
  const bridge=compareStaggeredAttWithMmm({causal:input.causal,mmmUnitMonths:all,driver:input.driver,
    outcome:'salesRub',populationKey:input.populationKey});
  return {...bridge,mmmUnitMonths:all,warnings:[...warnings,
    'Каждая когорта рассчитывается в отдельном контрфактическом сценарии; эффекты не являются индивидуально идентифицированными.',
    'Совпадение периода и единиц не доказывает эквивалентность causal и MMM воздействий.']};
}
