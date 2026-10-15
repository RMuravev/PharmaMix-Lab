import { RawPromoRow, RawSalesRow } from '../../types/pharma';

export interface PromoEffectivenessSummary {
  promoRows: number;
  duplicatePromoKeys: string[];
  unmatchedPromoKeys: string[];
  matchedPromoRows: number;
  zeroRateRows: number;
  matchedSalesRub: number;
  accruedBonusRub: number;
  byChain: Array<{ chain: string; salesRub: number; accruedBonusRub: number; promoRows: number }>;
}

const key = (month: string, chain: string, brand: string, sku: string) => `${month}\u001f${chain}\u001f${brand}\u001f${sku}`;

/**
 * Reconciles Promo at its declared chain×brand×SKU×month grain.
 * Sales from all regions are summed before applying the accrued rate, so a
 * regional panel can consume the result without multiplying the bonus.
 */
export function summarizePromoEffectiveness(sales: RawSalesRow[], promos: RawPromoRow[], blockedKeys: string[] = []): PromoEffectivenessSummary {
  const salesByKey = new Map<string, number>();
  for (const row of sales) {
    if (!Number.isFinite(row.salesRub) || row.salesRub < 0) continue;
    const k = key(row.month, row.chain, row.brand, row.sku);
    salesByKey.set(k, (salesByKey.get(k) || 0) + row.salesRub);
  }
  const seen = new Set<string>(blockedKeys);
  const duplicates = new Set<string>();
  const duplicateRows = new Set<string>();
  const unmatched: string[] = [];
  const byChain = new Map<string, { salesRub: number; accruedBonusRub: number; promoRows: number }>();
  let matchedPromoRows = 0;
  let zeroRateRows = 0;
  let matchedSalesRub = 0;
  let accruedBonusRub = 0;
  for (const row of promos) {
    const k = key(row.month, row.chain, row.brand, row.sku);
    if (seen.has(k)) { duplicates.add(k); duplicateRows.add(k); }
    seen.add(k);
    const salesRub = salesByKey.get(k);
    if (salesRub === undefined) { unmatched.push(k); continue; }
    if (!Number.isFinite(row.bonusPct) || row.bonusPct < 0) continue;
    const bonus = salesRub * row.bonusPct / 100;
    matchedPromoRows++;
    if (row.bonusPct === 0) zeroRateRows++;
    matchedSalesRub += salesRub;
    accruedBonusRub += bonus;
    const current = byChain.get(row.chain) || { salesRub: 0, accruedBonusRub: 0, promoRows: 0 };
    current.salesRub += salesRub;
    current.accruedBonusRub += bonus;
    current.promoRows++;
    byChain.set(row.chain, current);
  }
  // A duplicate Promo key is ambiguous even when rates match. Exclude its
  // contribution entirely rather than silently selecting or double-counting.
  if (duplicateRows.size) {
    const clean = promos.filter(row => !duplicateRows.has(key(row.month, row.chain, row.brand, row.sku)));
    const recalculated = summarizePromoEffectiveness(sales, clean);
    return { ...recalculated, promoRows: promos.length, duplicatePromoKeys: [...duplicates].sort() };
  }
  return {
    promoRows: promos.length,
    duplicatePromoKeys: [...duplicates].sort(),
    unmatchedPromoKeys: [...new Set(unmatched)].sort(),
    matchedPromoRows,
    zeroRateRows,
    matchedSalesRub,
    accruedBonusRub,
    byChain: [...byChain.entries()].map(([chain, value]) => ({ chain, ...value })).sort((a, b) => a.chain.localeCompare(b.chain))
  };
}
