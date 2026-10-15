import type { SalesFact, PromoFact, TvFact, VisitFact, MarketFact } from '../../domain/shared/facts';

/** A lossless sales-grain alignment. Never replicate source totals across lower-grain panels. */
export interface AlignedPanel {
  period: string; brand: string; region: string; chain: string;
  revenueRub: number; units: number;
  bonusEstimateRub: number;
  /** Shared brand-month TV signal: NOT additive across panels. */
  tvTrp: number | null;
  /** Shared brand-region-month visits signal: NOT additive across chains. Missing source rows are zero exposure. */
  weightedVisits: number | null;
  /** Shared region-brand-month market signal: NOT additive across chains. */
  marketRevenueRub: number | null;
}
export interface AlignmentResult {
  panels: AlignedPanel[];
  errors: string[]; warnings: string[];
  unmatchedPromo: number;
  /** Total estimated bonus over matched sales, counted once at SKU/chain/month grain. */
  totalBonusEstimateRub: number;
}
const norm = (v: string) => v.trim().toLocaleLowerCase();
const k = (...parts: string[]) => JSON.stringify(parts.map(norm));
const valid = (v: number) => Number.isFinite(v) && v >= 0;

export function alignPanelSources(input: {
  sales: SalesFact[]; promo: PromoFact[]; tv: TvFact[]; visits: VisitFact[]; market: MarketFact[];
}): AlignmentResult {
  const errors: string[] = [], warnings: string[] = [];
  const salesSku = new Map<string, number>();
  const panels = new Map<string, AlignedPanel>();
  for (const [i, s] of input.sales.entries()) {
    if (!valid(s.revenueRub) || !valid(s.units)) { errors.push(`Продажи ${i + 1}: некорректная сумма или количество.`); continue; }
    const skuKey = k(s.period, s.chain, s.brand, s.sku);
    salesSku.set(skuKey, (salesSku.get(skuKey) ?? 0) + s.revenueRub);
    const panelKey = k(s.period, s.brand, s.region, s.chain);
    const p = panels.get(panelKey) ?? { period: s.period, brand: s.brand, region: s.region, chain: s.chain,
      revenueRub: 0, units: 0, bonusEstimateRub: 0, tvTrp: null, weightedVisits: 0, marketRevenueRub: null };
    p.revenueRub += s.revenueRub; p.units += s.units;
    panels.set(panelKey, p);
  }
  // Promo is defined at chain/brand/SKU/month, whereas sales panels also contain region.
  // Allocate the estimated bonus proportionally to regional SKU sales, without multiplying it.
  const skuRegional = new Map<string, Map<string, number>>();
  for (const s of input.sales) {
    if (!valid(s.revenueRub) || !valid(s.units)) continue;
    const skuKey = k(s.period, s.chain, s.brand, s.sku);
    const panelKey = k(s.period, s.brand, s.region, s.chain);
    const regional = skuRegional.get(skuKey) ?? new Map<string, number>();
    regional.set(panelKey, (regional.get(panelKey) ?? 0) + s.revenueRub);
    skuRegional.set(skuKey, regional);
  }
  const promoSeen = new Set<string>();
  let unmatchedPromo = 0, totalBonusEstimateRub = 0;
  for (const [i, p] of input.promo.entries()) {
    const promoKey = k(p.period, p.chain, p.brand, p.sku);
    if (promoSeen.has(promoKey)) { errors.push(`Промо ${i + 1}: дублирующий ключ месяц/сеть/бренд/SKU; начисление не повторено.`); continue; }
    promoSeen.add(promoKey);
    if (!valid(p.bonusRatePct)) { errors.push(`Промо ${i + 1}: некорректная ставка бонуса.`); continue; }
    const revenue = salesSku.get(promoKey);
    if (revenue === undefined) { unmatchedPromo++; continue; }
    const bonus = revenue * p.bonusRatePct / 100;
    totalBonusEstimateRub += bonus;
    for (const [panelKey, regionalRevenue] of skuRegional.get(promoKey) ?? []) {
      const panel = panels.get(panelKey)!;
      // Algebraically equal to regionalRevenue * rate; handles zero sales safely.
      panel.bonusEstimateRub += regionalRevenue * p.bonusRatePct / 100;
    }
  }
  if (unmatchedPromo) warnings.push(`${unmatchedPromo} строк промо не сопоставлены с продажами.`);
  const tvMap = new Map<string, number>();
  for (const t of input.tv) {
    if (!valid(t.trp)) { errors.push('Некорректное значение TRP.'); continue; }
    const key = k(t.period, t.brand);
    tvMap.set(key, (tvMap.get(key) ?? 0) + t.trp);
  }
  const visitMap = new Map<string, number>();
  for (const v of input.visits) {
    if (!valid(v.weightedVisits)) { errors.push('Некорректное количество визитов.'); continue; }
    const key = k(v.period, v.brand, v.region);
    visitMap.set(key, (visitMap.get(key) ?? 0) + v.weightedVisits);
  }
  const marketMap = new Map<string, number>();
  const marketSkuSeen = new Set<string>();
  for (const m of input.market) {
    if (!valid(m.revenueRub)) { errors.push('Некорректная рыночная выручка.'); continue; }
    const unique = k(m.period, m.addressableMarket, m.brand, m.sku, m.region);
    if (marketSkuSeen.has(unique)) { errors.push('Дублирующий ключ рыночной строки; выручка не повторена.'); continue; }
    marketSkuSeen.add(unique);
    const key = k(m.period, m.brand, m.region);
    marketMap.set(key, (marketMap.get(key) ?? 0) + m.revenueRub);
  }
  if (new Set(input.market.map(m => norm(m.addressableMarket))).size > 1) {
    warnings.push('Несколько адресных рынков: marketRevenueRub агрегирован по рынкам; для анализа доли рынка необходим фильтр адресного рынка.');
  }
  for (const p of panels.values()) {
    p.tvTrp = tvMap.get(k(p.period, p.brand)) ?? null;
    p.weightedVisits = visitMap.get(k(p.period, p.brand, p.region)) ?? 0;
    p.marketRevenueRub = marketMap.get(k(p.period, p.brand, p.region)) ?? null;
  }
  warnings.push('TV, визиты и рынок являются повторяемыми сигналами более высокого уровня: не суммируйте их по панелям.');
  if (Math.abs([...panels.values()].reduce((a, p) => a + p.bonusEstimateRub, 0) - totalBonusEstimateRub) > 0.001) {
    errors.push('Контрольная сумма распределения промобонуса не совпала.');
  }
  return { panels: [...panels.values()].sort((a,b) => k(a.period,a.brand,a.region,a.chain).localeCompare(k(b.period,b.brand,b.region,b.chain))),
    errors, warnings, unmatchedPromo, totalBonusEstimateRub };
}
