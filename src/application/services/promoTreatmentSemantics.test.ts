import { describe, expect, it } from 'vitest';
import { buildCompleteExposurePanel } from './completeExposurePanelService';
import { matchCausalControls } from './causalControlMatchingService';

describe('promo treatment and staggered starts', () => {
  it('retains promo fact with zero accrued bonus as treatment', () => {
    const result = buildCompleteExposurePanel([{unitId:'A',period:'2026-01',promoActive:1,promoBonusRub:0}],{eligibleUnits:['A','B'],calendar:['2026-01']});
    expect(result.rows.find(r=>r.unitId==='A')?.promoActive).toBe(1);
    expect(result.rows.find(r=>r.unitId==='B')?.promoActive).toBe(0);
  });
  it('excludes late adopters from a common-start DiD design', () => {
    const calendar=['2026-01','2026-02','2026-03','2026-04','2026-05','2026-06'];
    const rows=['early','late','control'].flatMap(unitId=>calendar.map((period,i)=>({unitId,period,outcome:100+i,exposure:unitId==='early'&&i>=4||unitId==='late'&&i>=5?1:0})));
    const result=matchCausalControls(rows,'2026-05',{calendar,eligibleUnits:['early','late','control'],requireStartMonthExposure:true});
    expect(result.pairs).toHaveLength(1);
    expect(result.rejected.some(x=>x.includes('late')&&x.includes('поздний'))).toBe(true);
  });
});
