/** Pre-treatment-only nearest-neighbour matching for observational lift studies.
 * A missing promo row is a verified zero exposure per PharmaMix Lab data contract.
 * Missing sales and visit rows are also verified zeros INSIDE an explicit panel universe.
 */
export interface ControlPanelRow { unitId: string; period: string; outcome: number; exposure?: number }
export interface MatchedControl { treatedUnit: string; controlUnit: string; distance: number; preTrendGap: number }
export interface ControlMatchResult { pairs: MatchedControl[]; rejected: string[]; prePeriods: string[]; warnings: string[] }
const month = (p:string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(p);
const mean = (xs:number[]) => xs.reduce((a,b)=>a+b,0)/xs.length;
export function matchCausalControls(rows: ControlPanelRow[], treatmentStart: string, options: {
  minPrePeriods?: number; maxPreTrendGap?: number; maxDistance?: number;
  requireStartMonthExposure?: boolean;
  /** Explicitly known eligible units, including those with no source rows. */
  eligibleUnits?: string[];
  /** Explicit observation calendar; required to infer completely absent months. */
  calendar?: string[];
} = {}): ControlMatchResult {
  if (!month(treatmentStart)) throw new Error('Некорректный месяц начала воздействия.');
  const minPre = options.minPrePeriods ?? 4;
  const maxTrendGap = options.maxPreTrendGap ?? 0.35;
  const maxDistance = options.maxDistance ?? 2;
  if (!Number.isInteger(minPre) || minPre < 3 || !Number.isFinite(maxTrendGap) || maxTrendGap < 0 || !Number.isFinite(maxDistance) || maxDistance < 0) throw new Error('Некорректные настройки сопоставления.');
  const units = new Map<string, Map<string, ControlPanelRow>>();
  for (const row of rows) {
    if (!row.unitId?.trim() || !month(row.period) || !Number.isFinite(row.outcome) || (row.exposure !== undefined && (!Number.isFinite(row.exposure) || row.exposure < 0))) throw new Error('Некорректная запись панели.');
    if (!units.has(row.unitId)) units.set(row.unitId,new Map());
    const periods = units.get(row.unitId)!;
    if (periods.has(row.period)) throw new Error('Дубликат единица × месяц.');
    periods.set(row.period,row);
  }
  const calendar = options.calendar ?? [...new Set(rows.map(r=>r.period))];
  if (!calendar.length || calendar.some(p=>!month(p)) || new Set(calendar).size!==calendar.length) throw new Error('Некорректный календарь панели.');
  const eligibleUnits = options.eligibleUnits ?? [...units.keys()];
  if (!eligibleUnits.length || eligibleUnits.some(id=>!id?.trim()) || new Set(eligibleUnits).size!==eligibleUnits.length) throw new Error('Некорректный список единиц панели.');
  const validMonths = new Set(calendar);
  const validUnits = new Set(eligibleUnits);
  if (rows.some(r=>!validMonths.has(r.period)||!validUnits.has(r.unitId))) throw new Error('Запись вне заявленного охвата панели.');
  for (const id of eligibleUnits) {
    if (!units.has(id)) units.set(id,new Map());
    const data=units.get(id)!;
    for (const period of calendar) if (!data.has(period)) data.set(period,{unitId:id,period,outcome:0,exposure:0});
  }
  const prePeriods = calendar.filter(p=>p<treatmentStart).sort();
  if (prePeriods.length < minPre) throw new Error('Недостаточно месяцев до воздействия.');
  const postPeriods = calendar.filter(p=>p>=treatmentStart).sort();
  if (!postPeriods.length) throw new Error('Нет периодов после начала воздействия.');
  const treated: string[] = [], controls: string[] = [], rejected: string[] = [];
  for (const [id, data] of units) {
    // Undefined exposure means no promo record and therefore verified zero promo.
    const before = prePeriods.some(p=>(data.get(p)!.exposure ?? 0)>0);
    const after = postPeriods.some(p=>(data.get(p)!.exposure ?? 0)>0);
    if (before) { rejected.push(`${id}: воздействие до старта`); continue; }
    if (after && options.requireStartMonthExposure && (data.get(postPeriods[0])!.exposure ?? 0) === 0) {
      rejected.push(`${id}: поздний запуск после заданного старта (staggered adoption)`);
      continue;
    }
    (after ? treated : controls).push(id);
  }
  if (!treated.length || !controls.length) throw new Error('Не найдены сопоставимые группы воздействия и контроля.');
  const profile = (id:string) => prePeriods.map(p=>units.get(id)!.get(p)!.outcome);
  const trend = (ys:number[]) => { const base=Math.max(Math.abs(mean(ys)),1e-9); return (ys[ys.length-1]-ys[0])/base; };
  const pairs: MatchedControl[]=[];
  const available=new Set(controls);
  for (const id of treated) {
    const ys=profile(id), level=mean(ys), t=trend(ys);
    const ranked=[...available].map(controlUnit=>{
      const zs=profile(controlUnit), otherLevel=mean(zs), gap=Math.abs(t-trend(zs));
      const distance=Math.abs(Math.log((Math.abs(level)+1)/(Math.abs(otherLevel)+1)))+gap;
      return {treatedUnit:id,controlUnit,distance,preTrendGap:gap};
    }).sort((a,b)=>a.distance-b.distance);
    const best=ranked.find(r=>r.distance<=maxDistance && r.preTrendGap<=maxTrendGap);
    if (best) { pairs.push(best); available.delete(best.controlUnit); }
    else rejected.push(`${id}: не найден подходящий контроль`);
  }
  return {pairs,rejected,prePeriods,warnings:[
    'Подбор по продажам и предтренду не доказывает параллельные тренды или отсутствие скрытого смешения.',
    'Контрольные единицы используются без повторов; результаты зависят от порядка обработки.',
    'Отсутствующие продажи, визиты и промо считаются нулём только внутри явно определённого охвата панели.',
    'Проверяйте общие шоки, перетоки и другие маркетинговые воздействия.'
  ]};
}
