import type { AlignedPanel } from './panelSourceAlignmentService';
import type { CarryoverSettings } from './marketingCarryoverOptimizationService';
import type { HillSettings } from './marketingHillCvService';
import type { TemporalMmmFit } from './temporalMmmTrainingService';
import type { StaggeredResult } from './staggeredCausalLiftService';
import { calculateMarketingTrajectoryCounterfactuals } from './marketingTrajectoryCounterfactualService';
import { compareStaggeredAttWithMmm, type AttBridgeResult } from './causalMmmAttBridgeService';

export interface TrajectoryBridgeInput {
  panels: AlignedPanel[];
  fit: Pick<TemporalMmmFit, 'featureNames' | 'coefficients'>;
  carryover: CarryoverSettings;
  hill: HillSettings;
  causal: Pick<StaggeredResult, 'effects' | 'firstTreatment'>;
  driver: 'promoActive' | 'weightedVisits';
  /** Explicit, verified mapping from MMM panel to causal study unit. */
  unitIdForPanel: (panel: Pick<AlignedPanel, 'brand' | 'region' | 'chain'>) => string;
  populationKey: string;
  start: string;
  end: string;
  trainMean?: number[];
  trainStd?: number[];
}
/**
 * Bridges full-history MMM counterfactual trajectories to treated ATT unit-months.
 * Rejects duplicate mappings: aggregating region-level or chain-level effects
 * requires a separately validated allocation rule, not implicit multiplication.
 * The current MMM predicts RUBLES only; units comparisons are not supported.
 */
export function compareTrajectoryMmmWithStaggeredAtt(input: TrajectoryBridgeInput): AttBridgeResult {
  const driver = input.driver === 'promoActive' ? 'bonusEstimateRub' : input.driver;
  if (!input.panels.length || !input.populationKey.trim()) throw new Error('Отсутствует панель или ключ исследуемой совокупности.');
  const trajectory = calculateMarketingTrajectoryCounterfactuals(
    input.panels, input.fit, input.carryover, input.hill,
    { start: input.start, end: input.end, drivers: [driver], trainMean: input.trainMean, trainStd: input.trainStd }
  );
  const seen = new Set<string>();
  const mmmUnitMonths = trajectory.effects.map(effect => {
    const unitId = input.unitIdForPanel(effect).trim();
    if (!unitId) throw new Error('Не определён идентификатор единицы для MMM-панели.');
    const key = JSON.stringify([unitId, effect.period]);
    if (seen.has(key)) throw new Error('Несколько MMM-панелей отображаются на одну единицу-месяц. Требуется явное правило агрегации без двойного счёта.');
    seen.add(key);
    return { unitId, period: effect.period, incremental: effect.incrementalRub };
  });
  const eligible = new Set<string>();
  for (const e of input.causal.effects) {
    for (const [unit, cohort] of Object.entries(input.causal.firstTreatment)) {
      if (cohort === e.cohort) eligible.add(JSON.stringify([unit,e.period]));
    }
  }
  const selected = mmmUnitMonths.filter(row => eligible.has(JSON.stringify([row.unitId,row.period])));
  const result = compareStaggeredAttWithMmm({
    causal: input.causal, mmmUnitMonths: selected, driver: input.driver,
    outcome: 'salesRub', populationKey: input.populationKey
  });
  return {
    ...result,
    assumptions: [...result.assumptions, ...trajectory.warnings,
      'Сценарий MMM полностью отключает драйвер за всю доступную историю, а ATT(g,t) измеряет эффект после первого воздействия: estimand может отличаться.',
      'Для промо MMM использует рублёвый начисленный бонус, а Causal Lift — факт промо; эти вмешательства не эквивалентны без дополнительных допущений.'],
    aligned: { ...result.aligned, warnings: [...result.aligned.warnings, ...trajectory.warnings,
      'Проверяйте эквивалентность вмешательств: промо-бонус MMM не тождественен бинарному факту промо Causal Lift.'] }
  };
}
