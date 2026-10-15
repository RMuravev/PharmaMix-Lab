import {describe,it,expect} from 'vitest';
import {aggregateMmmTrajectoryToCausalUnits as aggregate} from './mmmCausalUnitAggregationService';
import type {TrajectoryEffect} from './marketingTrajectoryCounterfactualService';
const effect=(chain:string,incrementalRub:number,period='2026-01'):TrajectoryEffect=>({brand:'B',region:'R',chain,period,driver:'weightedVisits',incrementalRub,predictedWithRub:100+incrementalRub,predictedWithoutRub:100});
const base={driver:'weightedVisits' as const,unitForPanel:()=> 'R',expectedUnitMonths:[{unitId:'R',period:'2026-01'}],disjointSalesPanelsVerified:true};
describe('MMM to causal unit aggregation',()=>{
 it('sums disjoint pharmacy chain sales to one regional causal unit',()=>expect(aggregate({...base,effects:[effect('A',10),effect('B',20)]})[0].incremental).toBe(30));
 it('preserves true zero estimates',()=>expect(aggregate({...base,effects:[effect('A',0)]})[0].incremental).toBe(0));
 it('rejects missing unit-months instead of filling with zero',()=>expect(()=>aggregate({...base,effects:[effect('A',1)],expectedUnitMonths:[...base.expectedUnitMonths,{unitId:'R',period:'2026-02'}]})).toThrow(/Неполный охват/));
 it('rejects duplicate panels',()=>expect(()=>aggregate({...base,effects:[effect('A',1),effect('A',1)]})).toThrow(/Дублирующаяся/));
 it('requires verification of disjoint sales grain',()=>expect(()=>aggregate({...base,effects:[effect('A',1)],disjointSalesPanelsVerified:false})).toThrow(/Не подтверждена/));
 it('supports sparse cohort unit-months without extrapolation',()=>expect(aggregate({...base,effects:[effect('A',5),effect('A',7,'2026-02')],expectedUnitMonths:[{unitId:'R',period:'2026-02'}]})[0].incremental).toBe(7));
});
