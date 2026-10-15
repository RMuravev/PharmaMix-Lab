import { describe, expect, it } from 'vitest';
import { tuneTemporalRidge } from './temporalRidgeTuningService';
import type { TemporalDatasetResult } from './temporalModelDatasetService';
const periods = Array.from({length:16}, (_,i) => `${2024 + Math.floor(i/12)}-${String(i%12+1).padStart(2,'0')}`);
const rows = periods.map((period,i) => ({ period, panelKey:'A', actualRevenueRub: Math.exp(2 + 0.02*i), x:[i] }));
const dataset: TemporalDatasetResult = { train:rows.slice(0,13), test:rows.slice(13), featureNames:['tvTrp'], trainMean:[6], trainStd:[1], errors:[], warnings:[] };
describe('tuneTemporalRidge', () => {
  it('uses only train months for all CV folds and returns outer test predictions', () => {
    const result = tuneTemporalRidge(dataset, { lambdas:[0, 0.1, 1], minTrainMonths:7, validationMonths:2, folds:3 });
    expect(result.candidates).toHaveLength(3);
    expect(result.finalFit.testPredictions).toHaveLength(3);
    expect(result.candidates.flatMap(c => c.folds.flatMap(f => f.validationMonths)).every(m => m < periods[13])).toBe(true);
  });
  it('rejects invalid candidates and too-short history', () => {
    expect(() => tuneTemporalRidge(dataset, {lambdas:[1,1]})).toThrow();
    expect(() => tuneTemporalRidge(dataset, {lambdas:[1], minTrainMonths:12, folds:3, validationMonths:2})).toThrow();
  });
});
