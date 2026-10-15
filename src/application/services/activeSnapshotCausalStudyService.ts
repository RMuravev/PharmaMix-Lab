/** Construct causal studies from a consistent active snapshot without multiplying exposures. */
import type { ActiveDatasetSnapshot } from '../../infrastructure/indexeddb/activeDatasetSnapshotRepository';
import type { SalesFact, PromoFact, VisitFact } from '../../domain/shared/facts';
import type { ExposurePanelInput } from './completeExposurePanelService';

export type CausalStudyGrain = 'promo-chain-brand' | 'visits-region-brand';
export interface ActiveCausalStudy {
  eligibleUnits: string[];
  calendar: string[];
  rows: ExposurePanelInput[];
  driver: 'promoActive' | 'weightedVisits';
  datasetVersion: string;
  warnings: string[];
}
const key = (...parts: string[]) => JSON.stringify(parts.map(s => s.trim().toLocaleLowerCase()));
const month = (s: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
const finite = (n: number) => Number.isFinite(n) && n >= 0;
const unique = (items: string[]) => [...new Set(items)].sort();

/** Explicitly scope to one brand; never infer all possible unit-month combinations from absent sales. */
export function buildActiveCausalStudy(snapshot: ActiveDatasetSnapshot, grain: CausalStudyGrain, brand: string): ActiveCausalStudy {
  if (snapshot.legacy || !snapshot.datasetVersion) throw new Error('Требуется опубликованная активная версия данных.');
  if (!brand.trim()) throw new Error('Выберите бренд.');
  const sales = (snapshot.salesFacts as SalesFact[]).filter(s => s.brand.trim().toLocaleLowerCase() === brand.trim().toLocaleLowerCase());
  const promo = (snapshot.promoFacts as PromoFact[]).filter(p => p.brand.trim().toLocaleLowerCase() === brand.trim().toLocaleLowerCase());
  const visits = (snapshot.visitFacts as VisitFact[]).filter(v => v.brand.trim().toLocaleLowerCase() === brand.trim().toLocaleLowerCase());
  // The calendar includes observed source periods. A month without a sales row is
  // represented by an explicit zero outcome; absent promo/visit rows remain zero exposure.
  const periods = unique([...sales.map(s=>s.period), ...promo.map(p=>p.period), ...visits.map(v=>v.period)]);
  if (!periods.length || periods.some(p=>!month(p))) throw new Error('Нет корректного календаря исследования.');
  const unit = (s: SalesFact) => grain === 'promo-chain-brand' ? s.chain : s.region;
  // Universe is anchored in sales history, including zero-sales months. No invented retail distribution.
  const units = unique(sales.map(unit).filter(Boolean));
  if (units.length < 2) throw new Error('Для сравнения требуется минимум две сети или два региона с историей продаж.');
  if (units.length * periods.length > 1_000_000) throw new Error('Панель слишком велика.');
  const index = new Map<string, ExposurePanelInput>();
  const get = (u: string,p: string) => {
    const k = key(u,p);
    let row = index.get(k);
    if (!row) { row = {unitId:u,period:p,salesRub:0,salesUnits:0,weightedVisits:0,promoBonusRub:0,promoActive:0}; index.set(k,row); }
    return row;
  };
  for (const s of sales) {
    if (!finite(s.revenueRub) || !finite(s.units)) throw new Error('Некорректные продажи.');
    const row = get(unit(s),s.period);
    row.salesRub! += s.revenueRub; row.salesUnits! += s.units;
  }
  const warnings: string[] = [];
  if (grain === 'promo-chain-brand') {
    // Compute promo bonus exactly once per chain/brand/SKU/month, aggregating sales across regions.
    const revenueBySku = new Map<string,number>();
    for (const s of sales) {
      const k = key(s.period,s.chain,s.sku);
      revenueBySku.set(k,(revenueBySku.get(k)??0)+s.revenueRub);
    }
    const seen = new Set<string>();
    let unmatched=0;
    for (const p of promo) {
      if (!finite(p.bonusRatePct) || (p.accruedBonusRub !== undefined && !finite(p.accruedBonusRub))) throw new Error('Некорректные начисления промо.');
      const k=key(p.period,p.chain,p.sku);
      if (seen.has(k)) throw new Error('Дублирующее промо сеть × SKU × месяц.');
      seen.add(k);
      if (!units.includes(p.chain)) { unmatched++; continue; }
      const revenue = revenueBySku.get(k) ?? 0;
      // Actual accrued bonus, when present, has priority over sales-based estimate.
      get(p.chain,p.period).promoBonusRub! += p.accruedBonusRub ?? revenue*p.bonusRatePct/100;
      // Presence of a promo record is treatment even if accrued bonus and sales are zero.
      get(p.chain,p.period).promoActive = 1;
    }
    if (unmatched) warnings.push(`Промо вне подтверждённого охвата продаж: ${unmatched} записей.`);
    warnings.push('Промобонус зависит от фактических продаж; для причинного дизайна лучше использовать факт запуска или ставку промо как воздействие, иначе возможна эндогенность.');
  } else {
    // Visits are recorded at region/city/brand grain. Aggregate across cities, never multiply by chains or SKUs.
    for (const v of visits) {
      if (!finite(v.weightedVisits)) throw new Error('Некорректное количество визитов.');
      if (units.includes(v.region)) get(v.region,v.period).weightedVisits! += v.weightedVisits;
    }
    warnings.push('Визиты агрегированы по региону; эффект отдельных городов требует отдельной панели городов.');
  }
  // Materialize the declared unit × calendar panel so absent sales and exposure rows
  // become explicit zeros, including months with no sales at all.
  for (const u of units) for (const p of periods) get(u, p);
  warnings.push('Нулевые значения восстановлены внутри охвата единиц и календаря; отсутствие записи означает ноль, а не пропуск.');
  warnings.push('Для DiD необходим общий момент начала воздействия и чистый предшествующий период; неодновременные запуски требуют отдельного дизайна.');
  return {eligibleUnits:units,calendar:periods,rows:[...index.values()],driver:grain==='promo-chain-brand'?'promoActive':'weightedVisits',datasetVersion:snapshot.datasetVersion,warnings};
}
