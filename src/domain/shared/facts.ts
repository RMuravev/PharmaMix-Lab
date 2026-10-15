/** Domain-level shapes. Keep these independent from React and IndexedDB APIs. */
export interface SalesFact {
  id: string;
  projectId: string;
  period: string; // YYYY-MM
  region: string;
  city?: string;
  chain: string;
  brand: string;
  sku: string;
  units: number;
  revenueRub: number;
  datasetVersion: string;
}

export interface MarketFact {
  id: string;
  projectId: string;
  period: string;
  addressableMarket: string;
  brand: string;
  sku: string;
  region: string;
  units: number;
  revenueRub: number;
  datasetVersion: string;
}



export interface TvFact {
  id: string; projectId: string; period: string; brand: string; trp: number; datasetVersion: string;
}

export interface VisitFact {
  id: string; projectId: string; period: string; region: string; city?: string; brand: string;
  weightedVisits: number; datasetVersion: string;
}

/** Promo investment is an accrued sales bonus, not a customer discount. */
export interface PromoFact {
  id: string;
  projectId: string;
  period: string;
  chain: string;
  brand: string;
  sku: string;
  bonusRatePct: number;
  accruedBonusRub?: number;
  promoMechanic?: string;
  datasetVersion: string;
}

export function validateNonNegativeFinite(value: number, fieldName: string): void {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${fieldName}: ожидалось конечное неотрицательное число.`);
}

export function validateSalesFact(fact: SalesFact): void {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(fact.period)) throw new Error('period должен иметь формат YYYY-MM.');
  if (!fact.projectId || !fact.datasetVersion || !fact.brand || !fact.sku) throw new Error('SalesFact содержит пустое обязательное поле.');
  validateNonNegativeFinite(fact.units, 'units');
  validateNonNegativeFinite(fact.revenueRub, 'revenueRub');
}
