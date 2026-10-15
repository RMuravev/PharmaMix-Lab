import { describe, it, expect } from 'vitest';
import { reconcileCausalAndMmm, type ComparableEffect } from './causalMmmReconciliationService';
const base: ComparableEffect = {source:'mmm',driver:'promoActive',outcome:'salesRub',periodStart:'2025-01',periodEnd:'2025-03',populationKey:'brand=A;chains=treated',incrementalTotal:120,unitMonths:12};
const causal: ComparableEffect = {...base,source:'causal',incrementalTotal:100,ci95:[80,130]};
describe('causal/MMM reconciliation',()=>{
  it('compares identical horizons and scope',()=>{
    const r=reconcileCausalAndMmm(base,causal);
    expect(r.difference).toBe(20);expect(r.differencePctOfCausal).toBe(20);
    expect(r.mmmInsideCausalCi).toBe(true);
  });
  it('rejects mismatched scope, horizon and unit',()=>{
    expect(()=>reconcileCausalAndMmm(base,{...causal,populationKey:'other'})).toThrow();
    expect(()=>reconcileCausalAndMmm(base,{...causal,periodEnd:'2025-04'})).toThrow();
    expect(()=>reconcileCausalAndMmm(base,{...causal,unitMonths:13})).toThrow();
  });
  it('does not divide by zero',()=>{
    const r=reconcileCausalAndMmm(base,{...causal,incrementalTotal:0});
    expect(r.ratioMmmToCausal).toBeNull();expect(r.differencePctOfCausal).toBeNull();
  });
  it('rejects invalid intervals and NaN',()=>{
    expect(()=>reconcileCausalAndMmm(base,{...causal,ci95:[4,2]})).toThrow();
    expect(()=>reconcileCausalAndMmm({...base,incrementalTotal:NaN},causal)).toThrow();
  });
  it('flags sign disagreement',()=>{
    const r=reconcileCausalAndMmm({...base,incrementalTotal:-10},causal);
    expect(r.warnings.some(x=>x.includes('Знаки'))).toBe(true);
  });
});
