import { describe, expect, it } from 'vitest';
import { trainTemporalMmm } from './temporalMmmTrainingService';
import type { TemporalDatasetResult } from './temporalModelDatasetService';
const makeData = (): TemporalDatasetResult => ({
  train: [1,2,3,4,5,6].map((x,i) => ({ period:`2025-0${i+1}`, panelKey:'A', x:[x], actualRevenueRub: Math.exp(2+0.1*x) })),
  test: [{ period:'2025-07', panelKey:'A', x:[7], actualRevenueRub: Math.exp(2.7) }],
  featureNames:['tvTrp'], trainMean:[3.5], trainStd:[1], errors:[], warnings:[]
});
describe('trainTemporalMmm', () => {
  it('fits OLS only on train and predicts held-out revenue', () => {
    const d = makeData();
    const fit = trainTemporalMmm(d, { model:'ols' });
    expect(fit.coefficients[0]).toBeCloseTo(2, 8);
    expect(fit.coefficients[1]).toBeCloseTo(0.1, 8);
    expect(fit.testPredictions[0].predictedRevenueRub).toBeCloseTo(Math.exp(2.7), 8);
    expect(fit.diagnostics.rmse).toBeCloseTo(0, 8);
  });
  it('ridge shrinks slopes without penalizing intercept', () => {
    const fit = trainTemporalMmm(makeData(), { model:'ridge', lambda:100 });
    expect(Math.abs(fit.coefficients[1])).toBeLessThan(0.1);
    expect(fit.testPredictions).toHaveLength(1);
  });
  it('rejects singular OLS and accepts ridge', () => {
    const d = makeData(); d.train.forEach(r => { r.x=[1]; }); d.test[0].x=[1];
    expect(() => trainTemporalMmm(d, { model:'ols' })).toThrow(/вырождена/);
    expect(() => trainTemporalMmm(d, { model:'ridge' })).not.toThrow();
  });
  it('blocks invalid datasets, future leakage and invalid lambda', () => {
    const d = makeData(); d.errors=['bad'];
    expect(() => trainTemporalMmm(d, { model:'ols' })).toThrow(/Нельзя/);
    const d2 = makeData(); d2.train[0].period='2026-01';
    expect(() => trainTemporalMmm(d2, { model:'ols' })).toThrow(/утечка/);
    expect(() => trainTemporalMmm(makeData(), { model:'ridge', lambda:-1 })).toThrow(/lambda/);
  });
});
