import { describe, expect, it } from 'vitest';
import { assessMarketingParameterStability } from './marketingParameterStabilityService';

describe('marketing parameter stability', () => {
  it('rejects invalid window configuration', () => {
    expect(() => assessMarketingParameterStability([], {testStart:'2025-01',testEnd:'2025-02',windowCount:1})).toThrow();
    expect(() => assessMarketingParameterStability([], {testStart:'2025-01',testEnd:'2025-02',stepMonths:0})).toThrow();
  });
  it('reports insufficient history without inventing stability', () => {
    const result = assessMarketingParameterStability([], {testStart:'2025-01',testEnd:'2025-02'});
    expect(result.windows).toHaveLength(0);
    expect(result.drivers.every(d => !d.stable)).toBe(true);
    expect(result.warnings.some(w => w.includes('Недостаточно'))).toBe(true);
  });
});
