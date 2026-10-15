import type { UnitMonthEffect, AlignmentScope, AlignedReconciliation } from './causalMmmPopulationAlignmentService';
import { reconcileCausalAndMmm } from './causalMmmReconciliationService';
import type { StaggeredResult } from './staggeredCausalLiftService';

/** ATT bridge: compare only identifiable treated unit-months, never all-market MMM. */
export interface AttBridgeInput {
  causal: Pick<StaggeredResult, 'effects' | 'firstTreatment'>;
  /** MMM incremental outcomes must be recomputed for exactly these treated unit-months. */
  mmmUnitMonths: UnitMonthEffect[];
  driver: 'promoActive' | 'weightedVisits';
  outcome: 'salesRub' | 'salesUnits';
  populationKey: string;
}
export interface AttBridgeResult {
  aligned: AlignedReconciliation;
  causalUnitMonths: UnitMonthEffect[];
  scope: AlignmentScope;
  assumptions: string[];
}
export function compareStaggeredAttWithMmm(input: AttBridgeInput): AttBridgeResult {
  const { causal, mmmUnitMonths } = input;
  if (!input.populationKey.trim() || !['promoActive', 'weightedVisits'].includes(input.driver) ||
      !['salesRub', 'salesUnits'].includes(input.outcome)) throw new Error('Некорректные параметры ATT-сопоставления.');
  const effects = causal.effects;
  if (!effects.length) throw new Error('Нет идентифицируемых ATT(g,t) для сопоставления.');
  const first = causal.firstTreatment;
  const causalRows: UnitMonthEffect[] = [];
  const used = new Set<string>();
  for (const effect of effects) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(effect.cohort) ||
        !/^\d{4}-(0[1-9]|1[0-2])$/.test(effect.period) || effect.period < effect.cohort ||
        !Number.isFinite(effect.att) || !Number.isSafeInteger(effect.treatedUnits) || effect.treatedUnits < 1)
      throw new Error('Некорректная когортно-временная оценка ATT.');
    const units = Object.keys(first).filter(id => first[id] === effect.cohort).sort();
    if (units.length !== effect.treatedUnits) throw new Error('Количество единиц когорты не соответствует ATT(g,t).');
    for (const unitId of units) {
      const k = JSON.stringify([unitId, effect.period]);
      if (used.has(k)) throw new Error('Повторная оценка ATT для единицы-месяца.');
      used.add(k);
      causalRows.push({unitId, period: effect.period, incremental: effect.att});
    }
  }
  // Staggered cohorts create a sparse, triangular treated population. The rectangular
  // alignment service must NOT be fed a padded panel with fictitious zero effects.
  const mmm = new Map<string, number>();
  for (const row of mmmUnitMonths) {
    const k = JSON.stringify([row.unitId, row.period]);
    if (mmm.has(k) || !Number.isFinite(row.incremental)) throw new Error('Дубликат или некорректная оценка MMM.');
    mmm.set(k, row.incremental);
  }
  if (mmm.size !== used.size || [...used].some(k => !mmm.has(k)))
    throw new Error('MMM должен содержать ровно те же обработанные единицы-месяцы, что ATT. Нельзя подменять пропущенные оценки нулями.');
  const causalTotal = causalRows.reduce((s,r) => s+r.incremental, 0);
  const mmmTotal = [...mmm.values()].reduce((s,v) => s+v, 0);
  if (!Number.isFinite(causalTotal) || !Number.isFinite(mmmTotal)) throw new Error('Переполнение агрегированного эффекта.');
  const periods = causalRows.map(r=>r.period).sort();
  const scope: AlignmentScope = {driver: input.driver, outcome: input.outcome,
    periodStart: periods[0], periodEnd: periods[periods.length-1], populationKey: input.populationKey,
    unitIds: [...new Set(causalRows.map(r=>r.unitId))].sort(), periods: [...new Set(periods)]};
  const comparison = reconcileCausalAndMmm(
    {source:'mmm',driver:input.driver,outcome:input.outcome,periodStart:scope.periodStart,periodEnd:scope.periodEnd,populationKey:scope.populationKey,unitMonths:used.size,incrementalTotal:mmmTotal},
    {source:'causal',driver:input.driver,outcome:input.outcome,periodStart:scope.periodStart,periodEnd:scope.periodEnd,populationKey:scope.populationKey,unitMonths:used.size,incrementalTotal:causalTotal}
  );
  const assumptions = [
    'Сравнение ограничено обработанными единицами-месяцами с идентифицируемым ATT(g,t), а не всем рынком.',
    'Когортный ATT(g,t) применяется одинаково к каждой единице когорты: индивидуальная неоднородность эффекта неизвестна.',
    'MMM должен оценивать то же фактическое вмешательство и горизонт, включая carryover; совпадение ключей этого не гарантирует.',
    'Интервалы неопределённости и автоматическая калибровка отсутствуют.'
  ];
  return {aligned:{comparison,includedUnitMonths:used.size,warnings:[...comparison.warnings,...assumptions]},causalUnitMonths:causalRows,scope,assumptions};
}
