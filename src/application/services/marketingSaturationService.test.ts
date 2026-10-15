import { describe, expect, it } from 'vitest';
import { hillSaturation, selectHillByCv } from './marketingSaturationService';
describe('Hill saturation', () => {
  it('is zero at zero and one half at EC50', () => {
    expect(hillSaturation(0,{halfSaturation:10,slope:2})).toBe(0);
    expect(hillSaturation(10,{halfSaturation:10,slope:2})).toBeCloseTo(0.5);
  });
  it('is monotonic, bounded and numerically stable', () => {
    const s={halfSaturation:10,slope:2};
    expect(hillSaturation(1,s)).toBeLessThan(hillSaturation(100,s));
    expect(hillSaturation(1e300,{halfSaturation:1e-300,slope:20})).toBe(1);
  });
  it('rejects invalid inputs and selects minimum CV score', () => {
    expect(() => hillSaturation(-1,{halfSaturation:1,slope:1})).toThrow();
    expect(() => hillSaturation(1,{halfSaturation:0,slope:1})).toThrow();
    expect(selectHillByCv([{setting:{halfSaturation:1,slope:1},score:20},{setting:{halfSaturation:2,slope:1},score:10}]).setting.halfSaturation).toBe(2);
  });
});
