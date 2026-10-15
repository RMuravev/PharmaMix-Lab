import { describe, expect, it } from 'vitest';
import { reconcileAlignedUnitMonthEffects, type AlignmentScope } from './causalMmmPopulationAlignmentService';
const scope: AlignmentScope = {driver:'promoActive',outcome:'salesRub',periodStart:'2025-01',periodEnd:'2025-02',populationKey:'brand=A;treated=matched',unitIds:['a','b'],periods:['2025-01','2025-02']};
const rows = [ {unitId:'a',period:'2025-01',incremental:1}, {unitId:'a',period:'2025-02',incremental:2}, {unitId:'b',period:'2025-01',incremental:3}, {unitId:'b',period:'2025-02',incremental:4} ];
describe('strict MMM / Causal Lift population alignment',()=>{
 it('aggregates identical full panels without extrapolating',()=>{ const result=reconcileAlignedUnitMonthEffects(rows,rows.map(x=>({...x,incremental:x.incremental/2})),scope,[3,7]);expect(result.comparison.mmmTotal).toBe(10);expect(result.comparison.causalTotal).toBe(5);expect(result.includedUnitMonths).toBe(4); });
 it('rejects absent effect estimates instead of zero-filling',()=>{expect(()=>reconcileAlignedUnitMonthEffects(rows,rows.slice(1),scope)).toThrow(/Неполный охват/);});
 it('rejects duplicate unit-months',()=>{expect(()=>reconcileAlignedUnitMonthEffects([...rows,rows[0]],rows,scope)).toThrow(/Дубликат/);});
 it('rejects effects outside declared scope',()=>{expect(()=>reconcileAlignedUnitMonthEffects(rows,[...rows.slice(1),{unitId:'c',period:'2025-01',incremental:0}],scope)).toThrow(/вне охвата/);});
 it('rejects calendar gaps',()=>{expect(()=>reconcileAlignedUnitMonthEffects(rows,rows,{...scope,periods:['2025-01']})).toThrow();});
 it('allows zero incremental effects as genuine estimates',()=>{const zeros=rows.map(r=>({...r,incremental:0}));expect(reconcileAlignedUnitMonthEffects(zeros,zeros,scope).comparison.causalTotal).toBe(0);});
});
