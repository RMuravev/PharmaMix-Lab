import { describe, expect, it } from 'vitest';
import { compatibleRegistryPair, type AnalysisRegistryRecord } from './analysisRegistryRepository';
const base: AnalysisRegistryRecord = {id:'a',projectId:'p',datasetVersion:'v1',kind:'mmm',createdAt:'2026-01-01T00:00:00Z',algorithmVersion:'v1',definition:'promo-on/off',effect:{source:'mmm',driver:'promoActive',outcome:'salesRub',periodStart:'2026-01',periodEnd:'2026-03',populationKey:'cohort',incrementalTotal:100,unitMonths:3}};
describe('registry compatibility',()=>{
 it('matches identical estimands on same version',()=>expect(compatibleRegistryPair(base,{...base,id:'b',kind:'causal',effect:{...base.effect,source:'causal'}})).toBe(true));
 it('rejects different dataset versions',()=>expect(compatibleRegistryPair(base,{...base,kind:'causal',datasetVersion:'v2'})).toBe(false));
 it('rejects different exposure definitions',()=>expect(compatibleRegistryPair(base,{...base,kind:'causal',definition:'bonus-intensity'})).toBe(false));
 it('rejects different unit-month counts',()=>expect(compatibleRegistryPair(base,{...base,kind:'causal',effect:{...base.effect,unitMonths:2}})).toBe(false));
});
