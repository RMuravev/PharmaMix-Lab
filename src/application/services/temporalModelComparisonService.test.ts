import { describe, expect, it } from 'vitest';
import { compareTemporalModels } from './temporalModelComparisonService';
import type { TemporalDatasetResult } from './temporalModelDatasetService';
const rows = Array.from({length: 20}, (_,i) => ({ period:`${2023 + Math.floor(i/12)}-${String(i%12+1).padStart(2,'0')}`, panelKey:'brand-A', actualRevenueRub:Math.exp(2+i*.02), x:[i] }));
const dataset: TemporalDatasetResult = {train:rows.slice(0,17),test:rows.slice(17),featureNames:['tvTrp'],trainMean:[8],trainStd:[1],errors:[],warnings:[]};
describe('compareTemporalModels', () => {
 it('compares OLS and tuned Ridge on the same outer test observations', () => {
  const result = compareTemporalModels(dataset,[0.1,1],{minTrainMonths:8,validationMonths:2,folds:3});
  expect(result.ols).not.toBeNull();
  expect(result.ridge.finalFit.testPredictions).toHaveLength(3);
  expect(result.ranking).toHaveLength(2);
  expect(result.ridge.candidates.every(c=>c.folds.every(f=>f.validationMonths.every(m=>m<rows[17].period)))).toBe(true);
 });
 it('rejects invalid lambda candidates',()=>expect(()=>compareTemporalModels(dataset,[1,1])).toThrow());
});
