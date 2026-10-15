import { describe, expect, it } from 'vitest';
import { calculateMarketingCounterfactuals } from './marketingCounterfactualService';
import type { TemporalDatasetResult } from './temporalModelDatasetService';
const base: TemporalDatasetResult = {
  train: [], test: [{period:'2025-03',panelKey:'a',actualRevenueRub:100,x:[2,4]}],
  featureNames:['tvTrp','weightedVisits'], trainMean:[1,2],trainStd:[1,2],errors:[],warnings:[]
};
describe('marketing counterfactual', () => {
  it('removes only the selected driver without changing the other', () => {
    const report = calculateMarketingCounterfactuals(base,{featureNames:base.featureNames,coefficients:[Math.log(100),Math.log(2),0]}, {standardized:false});
    expect(report.drivers[0].predictedWithDriverRub).toBeCloseTo(400);
    expect(report.drivers[0].predictedWithoutDriverRub).toBeCloseTo(100);
    expect(report.drivers[0].incrementalRevenueRub).toBeCloseTo(300);
    expect(report.drivers[1].incrementalRevenueRub).toBeCloseTo(0);
  });
  it('uses the training mean to represent zero exposure after standardization', () => {
    const report = calculateMarketingCounterfactuals(base,{featureNames:base.featureNames,coefficients:[0,Math.log(2),0]}, {standardized:true,drivers:['tvTrp']});
    expect(report.drivers[0].predictedWithoutDriverRub).toBeCloseTo(0.5);
    expect(report.drivers[0].predictedWithDriverRub).toBeCloseTo(4);
  });
  it('rejects mismatched features and invalid coefficients', () => {
    expect(() => calculateMarketingCounterfactuals(base,{featureNames:['tvTrp'],coefficients:[0,1]}, {standardized:false})).toThrow();
    expect(() => calculateMarketingCounterfactuals(base,{featureNames:base.featureNames,coefficients:[0,NaN,1]}, {standardized:false})).toThrow();
  });
});
