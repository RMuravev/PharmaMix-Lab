import { describe, expect, it } from 'vitest';
import { summarizePromoEffectiveness } from './promoEffectiveness';

describe('summarizePromoEffectiveness', () => {
  it('applies one chain-level accrued rate across regional sales exactly once', () => {
    const sales: any[] = [
      { month: '2025-01', region: 'A', chain: 'Chain', brand: 'B', sku: 'S', salesRub: 100, units: 1 },
      { month: '2025-01', region: 'C', chain: 'Chain', brand: 'B', sku: 'S', salesRub: 300, units: 3 }
    ];
    const result = summarizePromoEffectiveness(sales, [{ month: '2025-01', chain: 'Chain', brand: 'B', sku: 'S', bonusPct: 5 } as any]);
    expect(result.accruedBonusRub).toBe(20);
    expect(result.byChain[0].salesRub).toBe(400);
  });

  it('keeps missing promo as zero exposure and retains zero-rate campaign presence', () => {
    const result = summarizePromoEffectiveness([{ month: '2025-01', region: 'A', chain: 'Chain', brand: 'B', sku: 'S', salesRub: 100, units: 1 } as any], [
      { month: '2025-01', chain: 'Chain', brand: 'B', sku: 'S', bonusPct: 0 } as any
    ]);
    expect(result.accruedBonusRub).toBe(0);
    expect(result.zeroRateRows).toBe(1);
  });

  it('reports duplicates and unmatched promo keys without inventing sales', () => {
    const result = summarizePromoEffectiveness([], [
      { month: '2025-01', chain: 'Chain', brand: 'B', sku: 'S', bonusPct: 5 } as any,
      { month: '2025-01', chain: 'Chain', brand: 'B', sku: 'S', bonusPct: 5 } as any
    ]);
    expect(result.duplicatePromoKeys).toHaveLength(1);
    expect(result.unmatchedPromoKeys).toHaveLength(1);
    expect(result.accruedBonusRub).toBe(0);
  });
});
