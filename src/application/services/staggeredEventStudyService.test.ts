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

import { diagnoseStaggeredEventStudy } from './staggeredEventStudyDiagnosticsService';
it('both production reports exclude own-cohort placebo controls and recover the exact six-unit lead',()=>{
 const calendar=Array.from({length:10},(_,i)=>`2026-${String(i+1).padStart(2,'0')}`),eligibleUnits=['A','B','C','D','E','F'];
 const rows=calendar.flatMap((period,i)=>eligibleUnits.map(unitId=>({unitId,period,salesRub:unitId==='A'&&i===3?20:0,promoActive:unitId==='A'&&i>=5?1:0})));
 const opts={eligibleUnits,calendar,driver:'promoActive' as const,preMonths:3,postMonths:1,minControls:5,bootstrapIterations:120};
 for(const report of [estimateStaggeredEventStudy(rows,opts),diagnoseStaggeredEventStudy(rows,opts)]){
  expect(report.points.find(p=>p.eventMonth===-2)?.att).toBe(20);
  expect(report.pretrendMaxAbsolute).toBe(20);
  expect(report.points.some(p=>p.eventMonth===-1)).toBe(false);
 }
});
it('excludes own cohort but retains external not-yet-treated controls',()=>{
 const calendar=Array.from({length:10},(_,i)=>`2026-${String(i+1).padStart(2,'0')}`),eligibleUnits=['A','B','C','D','E','F'];
 const rows=calendar.flatMap((period,i)=>eligibleUnits.map(unitId=>({unitId,period,salesRub:i===3?(unitId==='A'?20:unitId==='B'?12:0):0,promoActive:(unitId==='A'&&i>=5)||(unitId==='B'&&i>=7)?1:0})));
 const opts={eligibleUnits,calendar,driver:'promoActive' as const,preMonths:3,postMonths:1,minControls:1,bootstrapIterations:120};
 // A uses B,C,D,E,F: (20 - 12/5); B's own -2 contrast is 0. Equal treated weights.
 for(const report of [estimateStaggeredEventStudy(rows,opts),diagnoseStaggeredEventStudy(rows,opts)])expect(report.points.find(p=>p.eventMonth===-2)?.att).toBeCloseTo(8.8,12);
});
