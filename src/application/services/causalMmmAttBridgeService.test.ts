import { describe, expect, it } from 'vitest';
import { compareStaggeredAttWithMmm } from './causalMmmAttBridgeService';
const base = {driver:'promoActive' as const,outcome:'salesRub' as const,populationKey:'brand-X',causal:{firstTreatment:{A:'2026-02',B:'2026-03',C:null},effects:[{cohort:'2026-02',period:'2026-02',eventMonth:0,treatedUnits:1,controlUnits:2,att:10,counterfactualMean:100,relativeAttPct:10},{cohort:'2026-02',period:'2026-03',eventMonth:1,treatedUnits:1,controlUnits:1,att:20,counterfactualMean:100,relativeAttPct:20},{cohort:'2026-03',period:'2026-03',eventMonth:0,treatedUnits:1,controlUnits:1,att:30,counterfactualMean:100,relativeAttPct:30}]},mmmUnitMonths:[{unitId:'A',period:'2026-02',incremental:12},{unitId:'A',period:'2026-03',incremental:18},{unitId:'B',period:'2026-03',incremental:25}]};
describe('ATT to MMM bridge',()=>{
 it('compares only identifiable treated unit-months without padding controls',()=>{const r=compareStaggeredAttWithMmm(base);expect(r.aligned.includedUnitMonths).toBe(3);expect(r.aligned.comparison.causalTotal).toBe(60);expect(r.aligned.comparison.mmmTotal).toBe(55);expect(r.causalUnitMonths.every(x=>x.unitId!=='C')).toBe(true);});
 it('rejects missing MMM effects instead of inserting zeros',()=>expect(()=>compareStaggeredAttWithMmm({...base,mmmUnitMonths:base.mmmUnitMonths.slice(1)})).toThrow());
 it('rejects extra untreated MMM rows',()=>expect(()=>compareStaggeredAttWithMmm({...base,mmmUnitMonths:[...base.mmmUnitMonths,{unitId:'C',period:'2026-02',incremental:0}]})).toThrow());
 it('rejects inconsistent cohort sizes',()=>expect(()=>compareStaggeredAttWithMmm({...base,causal:{...base.causal,effects:[{...base.causal.effects[0],treatedUnits:2}]}})).toThrow());
});
