import { describe,it,expect } from 'vitest';
import { estimateStaggeredEventStudy } from './staggeredEventStudyService';
const calendar=['2026-01','2026-02','2026-03','2026-04','2026-05','2026-06'];
const data=calendar.flatMap((period,i)=>[
 {unitId:'A',period,salesRub:100+i*2+(i>=3?20:0),promoActive:i>=3?1:0},
 {unitId:'B',period,salesRub:90+i*2,promoActive:0},
 {unitId:'C',period,salesRub:80+i*2,promoActive:0},
]);
const opts={eligibleUnits:['A','B','C'],calendar,driver:'promoActive' as const,preMonths:2,postMonths:2,bootstrapIterations:30};
describe('staggered event-study',()=>{
 it('recovers a known uplift and zero pre-period placebo',()=>{const r=estimateStaggeredEventStudy(data,opts);expect(r.points.find(x=>x.eventMonth===0)?.att).toBeCloseTo(20);expect(r.points.find(x=>x.eventMonth===-2)?.att).toBeCloseTo(0);expect(r.points.find(x=>x.eventMonth===-1)).toBeUndefined();});
 it('is reproducible',()=>{expect(estimateStaggeredEventStudy(data,opts).points).toEqual(estimateStaggeredEventStudy(data,opts).points)});
 it('rejects invalid settings',()=>{expect(()=>estimateStaggeredEventStudy(data,{...opts,bootstrapIterations:2001})).toThrow()});
 it('warns on one treated cohort and insufficient controls',()=>{const r=estimateStaggeredEventStudy(data,{...opts,minControls:3});expect(r.warnings.some(w=>w.includes('менее двух treated'))).toBe(true);expect(r.warnings.some(w=>w.includes('недостаточно eligible controls'))).toBe(true);});
 it('keeps known uplift with two treated units and sufficient controls',()=>{const two=[...data,...calendar.map((period,i)=>({unitId:'D',period,salesRub:70+i*2+(i>=3?20:0),promoActive:i>=3?1:0}))];const r=estimateStaggeredEventStudy(two,{...opts,eligibleUnits:['A','B','C','D'],minControls:1});expect(r.points.find(x=>x.eventMonth===0)?.att).toBeCloseTo(20);expect(r.warnings.some(w=>w.includes('менее двух treated'))).toBe(false);});
});
