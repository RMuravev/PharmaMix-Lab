import { describe, expect, it } from 'vitest';
import { matchedLiftToRegistryRecord } from './causalRegistryExportService';
import type { MatchedLiftResult } from './causalLiftPipelineService';
const result: MatchedLiftResult = {
  driver:'promoActive',outcome:'salesRub',pairs:[{treatedUnit:'B',controlUnit:'C',distance:0,preTrendGap:0},{treatedUnit:'A',controlUnit:'D',distance:0,preTrendGap:0}],rejected:[],prePeriods:['2025-01'],postPeriods:['2025-02','2025-03'],liftPerUnitMonth:10,relativeLiftPct:10,ci95:[5,15],preTrendMaxAbsGap:0,preTrendMonthlyGaps:[],warnings:[],
};
const input = {result,projectId:'p',datasetVersion:'v1',treatmentStart:'2025-02',brand:'X',grain:'promo-chain-brand',id:'id',createdAt:'2026-10-15T00:00:00.000Z'};
describe('matchedLiftToRegistryRecord',()=>{
 it('scales point estimate and CI and preserves exact population',()=>{
   const r=matchedLiftToRegistryRecord(input);
   expect(r.effect.incrementalTotal).toBe(40);expect(r.effect.ci95).toEqual([20,60]);expect(r.effect.unitMonths).toBe(4);
   expect(JSON.parse(r.effect.populationKey)).toEqual({treatedUnits:['A','B'],postMonths:['2025-02','2025-03']});
 });
 it('rejects unsupported continuous promo intensity',()=>{
   expect(()=>matchedLiftToRegistryRecord({...input,result:{...result,driver:'promoBonusRub'}})).toThrow();
 });
 it('rejects duplicate treated units',()=>{
   expect(()=>matchedLiftToRegistryRecord({...input,result:{...result,pairs:[result.pairs[0],result.pairs[0]]}})).toThrow();
 });
});
