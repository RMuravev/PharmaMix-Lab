import { describe, expect, it } from 'vitest';
import { preparePanelSales, type FineSalesRow } from './panelSalesPreparationService';
const base: FineSalesRow = { month: '2026-01', brand: 'A', region: 'North', chain: 'Chain1', sku: 'S1', units: 2, salesRub: 100 };
describe('preparePanelSales', () => {
  it('sums distinct SKUs only inside the same brand/region/chain/month', () => {
    const result = preparePanelSales([base, { ...base, sku: 'S2', salesRub: 50 }, { ...base, region: 'South', salesRub: 25 }]);
    expect(result.valid).toBe(true);
    expect(result.panelCount).toBe(2);
    expect(result.panels.find(p => p.region === 'North')).toMatchObject({ salesRub: 150, units: 4, skuCount: 2 });
    expect(result.panels.find(p => p.region === 'South')?.salesRub).toBe(25);
  });
  it('rejects duplicate SKU rows instead of double counting', () => {
    const result = preparePanelSales([base, base]);
    expect(result.valid).toBe(false);
    expect(result.panels[0].salesRub).toBe(100);
  });
  it('checks expected months independently for each panel', () => {
    const result = preparePanelSales([base, { ...base, month: '2026-02' }, { ...base, region: 'South' }], { expectedMonths: ['2026-01', '2026-02'] });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('2026-02') && e.includes('South'))).toBe(true);
  });
  it('distinguishes valid zero sales from invalid log-model inputs', () => {
    const row = { ...base, salesRub: 0 };
    expect(preparePanelSales([row]).valid).toBe(true);
    expect(preparePanelSales([row], { requirePositiveSalesForLogModel: true }).valid).toBe(false);
  });
  it('rejects malformed dates, missing dimensions, and negative values', () => {
    expect(preparePanelSales([{ ...base, month: '2026-13' }]).valid).toBe(false);
    expect(preparePanelSales([{ ...base, chain: ' ' }]).valid).toBe(false);
    expect(preparePanelSales([{ ...base, units: -1 }]).valid).toBe(false);
  });
});
