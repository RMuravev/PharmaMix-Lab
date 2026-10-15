/** Auditable comparison of like-for-like causal and MMM incrementality estimates.
 * Does not calibrate coefficients or claim causal identification.
 */
export type MarketingDriver = 'weightedVisits' | 'promoActive' | 'tvTrp';
export type OutcomeUnit = 'salesRub' | 'salesUnits';
export interface ComparableEffect {
  source: 'mmm' | 'causal'; driver: MarketingDriver; outcome: OutcomeUnit;
  periodStart: string; periodEnd: string; populationKey: string;
  /** Aggregate incremental outcome over the same population and period. */
  incrementalTotal: number;
  /** Number of distinct unit-months contributing to this aggregate. */
  unitMonths: number;
  /** Optional uncertainty for causal estimate, same total units. */
  ci95?: [number, number] | null;
}
export interface ReconciledEffect {
  driver: MarketingDriver; outcome: OutcomeUnit; periodStart: string; periodEnd: string;
  populationKey: string; unitMonths: number;
  mmmTotal: number; causalTotal: number; difference: number;
  differencePctOfCausal: number | null;
  ratioMmmToCausal: number | null;
  causalCi95: [number, number] | null;
  mmmInsideCausalCi: boolean | null;
  warnings: string[];
}
const month = (s: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
function validate(e: ComparableEffect) {
  if (!['mmm','causal'].includes(e.source) || !['weightedVisits','promoActive','tvTrp'].includes(e.driver) ||
    !['salesRub','salesUnits'].includes(e.outcome) || !month(e.periodStart) || !month(e.periodEnd) ||
    e.periodStart > e.periodEnd || !e.populationKey.trim() || !Number.isFinite(e.incrementalTotal) ||
    !Number.isSafeInteger(e.unitMonths) || e.unitMonths < 1 ||
    (e.ci95 != null && (e.ci95.length !== 2 || !e.ci95.every(Number.isFinite) || e.ci95[0] > e.ci95[1]))) {
    throw new Error('Некорректная оценка эффекта или границы охвата.');
  }
}
export function reconcileCausalAndMmm(mmm: ComparableEffect, causal: ComparableEffect): ReconciledEffect {
  validate(mmm); validate(causal);
  if (mmm.source !== 'mmm' || causal.source !== 'causal') throw new Error('Укажите оценки MMM и Causal Lift в правильном порядке.');
  for (const key of ['driver','outcome','periodStart','periodEnd','populationKey','unitMonths'] as const) {
    if (mmm[key] !== causal[key]) throw new Error(`Нельзя сравнивать эффекты: не совпадает ${key}.`);
  }
  if (mmm.ci95 != null) throw new Error('Интервал неопределённости MMM не поддерживается этим сравнением.');
  const difference = mmm.incrementalTotal - causal.incrementalTotal;
  const denom = causal.incrementalTotal;
  const ci = causal.ci95 ?? null;
  const warnings = [
    'Сравнение не калибрует MMM и не подтверждает причинную интерпретацию ни одной оценки.',
    'Оценки должны относиться к одному определению воздействия, горизонту, населению и единице измерения; совпадение метаданных само по себе этого не доказывает.',
    'Causal Lift может оценивать ATT на участвовавших единицах, а MMM — иной estimand; до сравнения их необходимо привести к одной целевой величине.',
  ];
  if (denom === 0) warnings.push('Причинная оценка равна нулю: относительное расхождение не определено.');
  if (Math.sign(mmm.incrementalTotal) !== Math.sign(denom)) warnings.push('Знаки оценок MMM и Causal Lift различаются.');
  if (ci && (ci[0] <= 0 && ci[1] >= 0)) warnings.push('Интервал Causal Lift включает ноль; относительные показатели могут быть неустойчивыми.');
  return {driver:mmm.driver,outcome:mmm.outcome,periodStart:mmm.periodStart,periodEnd:mmm.periodEnd,
    populationKey:mmm.populationKey,unitMonths:mmm.unitMonths,mmmTotal:mmm.incrementalTotal,
    causalTotal:denom,difference,differencePctOfCausal:denom !== 0 ? 100*difference/Math.abs(denom) : null,
    ratioMmmToCausal:denom !== 0 ? mmm.incrementalTotal/denom : null,causalCi95:ci,
    mmmInsideCausalCi:ci ? mmm.incrementalTotal >= ci[0] && mmm.incrementalTotal <= ci[1] : null,warnings};
}
