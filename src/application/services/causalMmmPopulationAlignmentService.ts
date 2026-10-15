import { reconcileCausalAndMmm, type ComparableEffect, type ReconciledEffect, type MarketingDriver, type OutcomeUnit } from './causalMmmReconciliationService';

/** Explicit observation-level alignment: both methods must cover exactly the same unit-month keys.
 * No extrapolation from ATT to an entire market, and no implicit scaling of averages to totals.
 */
export interface UnitMonthEffect {
  unitId: string;
  period: string;
  /** Additive incremental outcome in rubles or units for this unit-month. */
  incremental: number;
}
export interface AlignmentScope {
  driver: MarketingDriver;
  outcome: OutcomeUnit;
  periodStart: string;
  periodEnd: string;
  /** Human-readable scope identifier, e.g. brand/region/chain/cohort; must be same for both methods. */
  populationKey: string;
  /** Exact eligible population, supplied by the caller, not inferred from available effects. */
  unitIds: string[];
  /** Exact calendar; do not infer missing periods from one method's rows. */
  periods: string[];
}
export interface AlignedReconciliation {
  comparison: ReconciledEffect;
  includedUnitMonths: number;
  warnings: string[];
}
const month = (p: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(p);
const key = (unitId: string, period: string) => JSON.stringify([unitId, period]);
function validateScope(scope: AlignmentScope): void {
  if (!scope.populationKey.trim() || !scope.unitIds.length || !scope.periods.length ||
      !month(scope.periodStart) || !month(scope.periodEnd) || scope.periodStart > scope.periodEnd ||
      new Set(scope.unitIds).size !== scope.unitIds.length || scope.unitIds.some(id => !id.trim()) ||
      new Set(scope.periods).size !== scope.periods.length ||
      scope.periods.some(p => !month(p) || p < scope.periodStart || p > scope.periodEnd) ||
      !scope.periods.includes(scope.periodStart) || !scope.periods.includes(scope.periodEnd) ||
      !['weightedVisits', 'promoActive', 'tvTrp'].includes(scope.driver) ||
      !['salesRub', 'salesUnits'].includes(scope.outcome)) {
    throw new Error('Некорректный охват сопоставления MMM и Causal Lift.');
  }
  const expected: string[] = [];
  let [year, m] = scope.periodStart.split('-').map(Number);
  while (`${year}-${String(m).padStart(2,'0')}` <= scope.periodEnd) {
    expected.push(`${year}-${String(m).padStart(2,'0')}`);
    if (++m === 13) { year++; m = 1; }
  }
  if (expected.length !== scope.periods.length || expected.some(p => !scope.periods.includes(p)))
    throw new Error('Календарь сопоставления содержит пропущенные месяцы.');
}
function aggregate(rows: UnitMonthEffect[], scope: AlignmentScope, source: 'mmm' | 'causal', ci95?: [number,number] | null): ComparableEffect {
  const eligible = new Set(scope.unitIds);
  const periods = new Set(scope.periods);
  const observed = new Set<string>();
  let total = 0;
  for (const row of rows) {
    if (!row.unitId || !month(row.period) || !Number.isFinite(row.incremental) ||
        !eligible.has(row.unitId) || !periods.has(row.period))
      throw new Error(`Недопустимая запись ${source}: значение или единица вне охвата.`);
    const id = key(row.unitId, row.period);
    if (observed.has(id)) throw new Error(`Дубликат единицы-месяца в ${source}: ${row.unitId} / ${row.period}.`);
    observed.add(id);
    total += row.incremental;
  }
  const count = scope.unitIds.length * scope.periods.length;
  if (!Number.isSafeInteger(count) || count > 2_000_000) throw new Error('Слишком большой охват для проверки сопоставимости.');
  if (observed.size !== count) throw new Error(`Неполный охват ${source}: ${observed.size} из ${count} единиц-месяцев. Не подменяйте отсутствующую оценку эффекта нулём.`);
  if (!Number.isFinite(total)) throw new Error('Переполнение при агрегации эффектов.');
  return { source, driver: scope.driver, outcome: scope.outcome, periodStart: scope.periodStart,
    periodEnd: scope.periodEnd, populationKey: scope.populationKey, unitMonths: count,
    incrementalTotal: total, ...(source === 'causal' ? { ci95 } : {}) };
}
/** CI, if supplied, must already be on the aggregate-total scale, not ATT per unit-month. */
export function reconcileAlignedUnitMonthEffects(
  mmmRows: UnitMonthEffect[], causalRows: UnitMonthEffect[], scope: AlignmentScope,
  causalTotalCi95?: [number, number] | null
): AlignedReconciliation {
  validateScope(scope);
  const mmm = aggregate(mmmRows, scope, 'mmm');
  const causal = aggregate(causalRows, scope, 'causal', causalTotalCi95);
  const comparison = reconcileCausalAndMmm(mmm, causal);
  return { comparison, includedUnitMonths: comparison.unitMonths, warnings: [
    ...comparison.warnings,
    'Проверена идентичность ключей unitId × month, но не идентичность estimand: ATT и MMM-контрфактуал должны описывать одинаковое вмешательство.',
    'Проверка не превращает модельные эффекты в причинные и не выполняет автоматическую калибровку.'
  ] };
}
