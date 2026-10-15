import type { TrajectoryEffect } from './marketingTrajectoryCounterfactualService';
import type { UnitMonthEffect } from './causalMmmPopulationAlignmentService';

/**
 * Aggregate panel-level MMM predictions to an explicitly defined causal unit.
 * A single panel may be assigned to only one causal unit. Shared exposures
 * (e.g. TV/visits) must not be copied into multiple units as independent sales.
 * Predictions are summed over disjoint SALES panels, not over exposures.
 */
export function aggregateMmmTrajectoryToCausalUnits(input: {
  effects: TrajectoryEffect[];
  driver: TrajectoryEffect['driver'];
  /** Stable unit ID or null when panel does not belong to this causal population. */
  unitForPanel: (panel: Pick<TrajectoryEffect,'brand'|'region'|'chain'>) => string | null;
  /** Exact sparse or rectangular unit-months from the causal study. */
  expectedUnitMonths: Array<{unitId:string;period:string}>;
  /** Only disjoint panel sales may be summed. Caller must validate source grain. */
  disjointSalesPanelsVerified: boolean;
}): UnitMonthEffect[] {
  if (!input.disjointSalesPanelsVerified) throw new Error('Не подтверждена непересекающаяся детализация продаж MMM-панелей.');
  const key = (u:string,p:string)=>JSON.stringify([u,p]);
  const expected = new Set<string>();
  for (const row of input.expectedUnitMonths) {
    if (!row.unitId.trim() || !/^\d{4}-(0[1-9]|1[0-2])$/.test(row.period)) throw new Error('Некорректная единица или месяц Causal Lift.');
    const k=key(row.unitId,row.period);
    if (expected.has(k)) throw new Error('Дубликат единицы-месяца в Causal Lift.');
    expected.add(k);
  }
  if (!expected.size) throw new Error('Пустой охват Causal Lift.');
  const seenPanels = new Set<string>();
  const totals = new Map<string,number>();
  for (const effect of input.effects) {
    if (effect.driver !== input.driver) continue;
    const panelKey=JSON.stringify([effect.brand,effect.region,effect.chain,effect.period,effect.driver]);
    if (seenPanels.has(panelKey)) throw new Error('Дублирующаяся MMM-панель: риск двойного счёта.');
    seenPanels.add(panelKey);
    if (!Number.isFinite(effect.incrementalRub) || !Number.isFinite(effect.predictedWithRub) || !Number.isFinite(effect.predictedWithoutRub)) throw new Error('Некорректный прогноз MMM.');
    const unit = input.unitForPanel(effect);
    if (unit === null) continue;
    if (!unit.trim()) throw new Error('Пустой идентификатор единицы MMM.');
    const k=key(unit,effect.period);
    if (!expected.has(k)) continue;
    const sum=(totals.get(k)??0)+effect.incrementalRub;
    if (!Number.isFinite(sum)) throw new Error('Переполнение агрегированного эффекта MMM.');
    totals.set(k,sum);
  }
  if (totals.size!==expected.size) throw new Error(`Неполный охват MMM: ${totals.size} из ${expected.size} единиц-месяцев.`);
  return input.expectedUnitMonths.map(({unitId,period})=>({unitId,period,incremental:totals.get(key(unitId,period))!}));
}
