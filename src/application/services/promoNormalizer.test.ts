import { describe, expect, it } from 'vitest';
import { normalizePromoRows } from './promoNormalizer';

describe('normalizePromoRows', () => {
  it('normalizes Russian columns and retains mechanic and accrued bonus', () => {
    const result = normalizePromoRows([{ 'Год-месяц': '2026-2', 'Аптечная сеть': 'Сеть А', 'Бренд': 'Brand X', 'SKU': 'X-1', '% инвестиций': '4,5%', 'Фактически начисленный бонус': '1 250,50', 'Механика промо': 'Бонус за объём' }], 'p1');
    expect(result.facts).toHaveLength(1);
    expect(result.facts[0]).toMatchObject({ period: '2026-02', chain: 'Сеть А', bonusRatePct: 4.5, accruedBonusRub: 1250.5, promoMechanic: 'Бонус за объём' });
    expect(result.skippedRows).toBe(0);
  });
  it('rejects invalid rate and negative bonus', () => {
    const result = normalizePromoRows([{ period: '2026-01', chain: 'A', brand: 'B', sku: 'S', 'investment percent': 120, 'accrued bonus': -1 }], 'p1');
    expect(result.facts).toHaveLength(0);
    expect(result.issues.length).toBeGreaterThanOrEqual(2);
  });
  it('does not confuse missing accrued bonus with zero', () => {
    const result = normalizePromoRows([{ period: '2026-01', chain: 'A', brand: 'B', sku: 'S', 'investment percent': 3 }], 'p1');
    expect(result.facts[0].accruedBonusRub).toBeUndefined();
  });
});
