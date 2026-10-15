import { describe, expect, it } from 'vitest';
import { summarizePromoCohorts } from './promoCohortEffectiveness';

describe('summarizePromoCohorts', () => {
  it('aggregates regional sales once and returns deterministic bootstrap CI', () => {
    const sales: any[] = [
      { month: '2025-01', region: 'A', chain: 'C', brand: 'B', sku: 'S', salesRub: 100 },
      { month: '2025-01', region: 'D', chain: 'C', brand: 'B', sku: 'S', salesRub: 300 },
      { month: '2025-01', region: 'A', chain: 'C', brand: 'B', sku: 'T', salesRub: 200 }
    ];
    const out = summarizePromoCohorts(sales, [
      { month: '2025-01', chain: 'C', brand: 'B', sku: 'S', bonusPct: 5, mechanic: 'A' },
      { month: '2025-01', chain: 'C', brand: 'B', sku: 'T', bonusPct: 0, mechanic: 'A' }
    ] as any);
    expect(out[0].salesRub).toBe(600); expect(out[0].bonusRub).toBe(20); expect(out[0].observations).toBe(2); expect(out[0].meanSalesCi).not.toBeNull();
  });
  it('excludes duplicate and unmatched keys and reports coverage', () => {
    const out = summarizePromoCohorts([{ month: '2025-01', chain: 'C', brand: 'B', sku: 'S', salesRub: 100 } as any], [
      { month: '2025-01', chain: 'C', brand: 'B', sku: 'S', bonusPct: 5, mechanic: 'A' },
      { month: '2025-01', chain: 'C', brand: 'B', sku: 'S', bonusPct: 10, mechanic: 'A' },
      { month: '2025-01', chain: 'C', brand: 'B', sku: 'X', bonusPct: 5, mechanic: 'A' }
    ] as any);
    expect(out[0].observations).toBe(0); expect(out[0].coveragePct).toBe(0); expect(out[0].warnings.join(' ')).toContain('исключены');
  });
});
