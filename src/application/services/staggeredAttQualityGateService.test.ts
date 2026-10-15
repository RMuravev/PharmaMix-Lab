import {describe,it,expect} from 'vitest';
import {estimateStaggeredCausalLift} from './staggeredCausalLiftService';
import {assessStaggeredAttQuality} from './staggeredAttQualityGateService';
const calendar=['2025-01','2025-02','2025-03','2025-04','2025-05'];
const units=['t1','t2','t3','c1','c2','c3'];
const opts={eligibleUnits:units,calendar,driver:'promoActive' as const};
const data=units.flatMap((u,j)=>calendar.map((period,i)=>({unitId:u,period,salesRub:100+j*3+i*2+(j<3&&i>=3?50:0),promoActive:j<3&&i>=3?1:0})));
const policy={minTreatedUnits:3,minControlUnits:3,minPrePeriods:3,maxPlaceboPct:0.05,bootstrapReplicates:100};
describe('staggered ATT quality gate',()=>{
 it('accepts stable pretrends and positive effect',()=>{const att=estimateStaggeredCausalLift(data,opts);const q=assessStaggeredAttQuality(data,opts,att,policy);expect(q.eligibleCount).toBe(2);expect(q.rows[0].ciLow).toBeGreaterThan(0);});
 it('blocks inadequate prehistory',()=>{const att=estimateStaggeredCausalLift(data,opts);const q=assessStaggeredAttQuality(data,opts,att,{...policy,minPrePeriods:4});expect(q.eligibleCount).toBe(0);});
 it('blocks nonparallel placebo trends',()=>{const bad=data.map(r=>r.unitId==='t1'&&r.period==='2025-03'?{...r,salesRub:r.salesRub+100}:r);const att=estimateStaggeredCausalLift(bad,opts);const q=assessStaggeredAttQuality(bad,opts,att,policy);expect(q.rows[0].reasons).toContain('Существенное расхождение предтрендов (placebo).');});
 it('rejects inconsistent ATT inputs',()=>{const att=estimateStaggeredCausalLift(data,opts);att.effects[0].att+=10;expect(()=>assessStaggeredAttQuality(data,opts,att,policy)).toThrow();});
});
