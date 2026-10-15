import {describe, it, expect} from 'vitest';
import {mmmEffectsToMatchedRegistryRecord} from './mmmRegistryExportService';
import type {AnalysisRegistryRecord} from '../../infrastructure/indexeddb/analysisRegistryRepository';
const causal: AnalysisRegistryRecord = {
  id:'causal-1',projectId:'p',datasetVersion:'v1',kind:'causal',createdAt:'2026-01-01T00:00:00Z',
  algorithmVersion:'matched-did-v1',definition:'matched-did:promoActive',
  effect:{source:'causal',driver:'promoActive',outcome:'salesRub',periodStart:'2025-02',periodEnd:'2025-03',
    populationKey:JSON.stringify({treatedUnits:['a','b'],postMonths:['2025-02','2025-03']}),incrementalTotal:20,unitMonths:4}
};
const rows = ['a','b'].flatMap(unitId=>['2025-02','2025-03'].map(period=>({unitId,period,incremental:5})));
const input = {causalRecord:causal,mmmUnitMonths:rows,id:'mmm-1',createdAt:'2026-01-02T00:00:00Z',algorithmVersion:'trajectory-v1',exposureDefinitionVerified:true};
describe('mmmEffectsToMatchedRegistryRecord',()=>{
 it('exports exact matched scope',()=>{const r=mmmEffectsToMatchedRegistryRecord(input);expect(r.effect.incrementalTotal).toBe(20);expect(r.definition).toBe(causal.definition);expect(r.effect.source).toBe('mmm');});
 it('rejects unverified exposure definition',()=>expect(()=>mmmEffectsToMatchedRegistryRecord({...input,exposureDefinitionVerified:false})).toThrow());
 it('rejects missing rows',()=>expect(()=>mmmEffectsToMatchedRegistryRecord({...input,mmmUnitMonths:rows.slice(1)})).toThrow());
 it('rejects duplicate rows',()=>expect(()=>mmmEffectsToMatchedRegistryRecord({...input,mmmUnitMonths:[...rows.slice(0,3),rows[0]]})).toThrow());
 it('rejects nonfinite effect',()=>expect(()=>mmmEffectsToMatchedRegistryRecord({...input,mmmUnitMonths:[{...rows[0],incremental:NaN},...rows.slice(1)]})).toThrow());
});
