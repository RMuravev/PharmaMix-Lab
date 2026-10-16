import { describe, expect, it } from 'vitest';
import { ols } from './ols';
import { calculateVif } from './vif';

describe('current statistical kernels', () => {
  it('fits a known linear relation with the retained scaled OLS formula', () => {
    const result = ols([[1, 0], [1, 1], [1, 2], [1, 3]], [2, 5, 8, 11]);
    expect(result.beta[0]).toBeCloseTo(2, 7);
    expect(result.beta[1]).toBeCloseTo(3, 7);
    expect(result.r2).toBeCloseTo(1, 9);
  });

  it('reports infinite VIF for exactly collinear current MMM drivers', () => {
    const design = Array.from({ length: 6 }, (_, i) => [1, i + 1, (i + 1) * 2]);
    expect(calculateVif(design, ['const', 'logTRP', 'bonusIdx'])).toEqual({ logTRP: Infinity, bonusIdx: Infinity });
  });
});
