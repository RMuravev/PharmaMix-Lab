/** Observational two-period Difference-in-Differences. This is NOT a randomized A/B test.
 * Units must be selected using only pre-treatment characteristics; caller must
 * independently check parallel pre-trends, spillovers and concurrent interventions.
 */
export interface LiftObservation { unitId: string; period: string; treated: boolean; outcome: number }
export interface LiftResult {
  treatedUnits: number; controlUnits: number; prePeriods: string[]; postPeriods: string[];
  treatedPre: number; treatedPost: number; controlPre: number; controlPost: number;
  absoluteLift: number; relativeLiftPct: number | null; warnings: string[];
}
export function estimateDifferenceInDifferences(
  observations: LiftObservation[], treatmentStart: string,
  options: { eligibleUnits?: string[]; calendar?: string[] } = {},
): LiftResult {
  const validPeriod = (s: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
  if (!validPeriod(treatmentStart) || !observations.length) throw new Error('Укажите начало воздействия и наблюдения.');
  const units = new Map<string, { treated: boolean; months: Map<string, number> }>();
  for (const row of observations) {
    if (!row.unitId.trim() || !validPeriod(row.period) || !Number.isFinite(row.outcome)) throw new Error('Некорректная панельная запись.');
    let unit = units.get(row.unitId);
    if (!unit) { unit = { treated: row.treated, months: new Map() }; units.set(row.unitId, unit); }
    if (unit.treated !== row.treated) throw new Error('Группа единицы должна быть постоянной.');
    if (unit.months.has(row.period)) throw new Error('Дубликат единица × месяц.');
    unit.months.set(row.period, row.outcome);
  }
  const calendar = options.calendar ?? [...new Set(observations.map(o=>o.period))];
  if (!calendar.length || calendar.some(p=>!validPeriod(p)) || new Set(calendar).size!==calendar.length) throw new Error('Некорректный календарь.');
  const eligibleUnits = options.eligibleUnits ?? [...units.keys()];
  if (!eligibleUnits.length || new Set(eligibleUnits).size!==eligibleUnits.length || eligibleUnits.some(id=>!id?.trim())) throw new Error('Некорректный список единиц.');
  if (observations.some(r=>!calendar.includes(r.period)||!eligibleUnits.includes(r.unitId))) throw new Error('Наблюдение вне охвата панели.');
  for (const id of eligibleUnits) {
    const unit=units.get(id);
    if (!unit) throw new Error(`Для полностью отсутствующей единицы ${id} необходимо явно указать группу воздействия.`);
    for (const period of calendar) if (!unit.months.has(period)) unit.months.set(period,0);
  }
  const treated = [...units.values()].filter(u => u.treated);
  const control = [...units.values()].filter(u => !u.treated);
  if (!treated.length || !control.length) throw new Error('Нужны и воздействие, и контроль.');
  const common = [...calendar].sort();
  const prePeriods = common.filter(p => p < treatmentStart);
  const postPeriods = common.filter(p => p >= treatmentStart);
  if (!prePeriods.length || !postPeriods.length) throw new Error('Нужны общие периоды до и после воздействия для каждой единицы.');
  const avg = (group: typeof treated, periods: string[]) => group.reduce((sum,u) => sum + periods.reduce((s,p) => s + u.months.get(p)!,0)/periods.length,0)/group.length;
  const treatedPre = avg(treated,prePeriods), treatedPost = avg(treated,postPeriods);
  const controlPre = avg(control,prePeriods), controlPost = avg(control,postPeriods);
  const absoluteLift = (treatedPost-treatedPre)-(controlPost-controlPre);
  const baseline = treatedPre + (controlPost-controlPre);
  const warnings = ['Наблюдательное сравнение: не рандомизированный A/B-тест. Проверяйте параллельные тренды, подбор контроля, одновременные воздействия и перетоки эффекта.'];
  if (prePeriods.length < 3) warnings.push('Меньше трёх общих периодов до воздействия: оценка параллельных трендов ограничена.');
  if (observations.length < units.size*calendar.length) warnings.push('Отсутствующие продажи внутри заданного охвата заполнены нулями.');
  return {treatedUnits:treated.length,controlUnits:control.length,prePeriods,postPeriods,treatedPre,treatedPost,controlPre,controlPost,absoluteLift,relativeLiftPct:baseline === 0 ? null : 100*absoluteLift/Math.abs(baseline),warnings};
}
