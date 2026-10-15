import { describe, expect, it } from 'vitest';
import { prepareTemporalModelDataset } from './temporalModelDatasetService';
import type { DesignMatrixRow } from './panelDesignMatrixService';
const row = (period: string, tv: number, region = 'N'): DesignMatrixRow => ({
  period, brand:'A', region, chain:'X', actualRevenueRub:100,
  features:{tvTrp:tv, weightedVisits:2, bonusEstimateRub:10, marketRevenueRub:null}
});
describe('prepareTemporalModelDataset', () => {
  it('splits strictly by month and fits scaling on train only', () => {
    const result = prepareTemporalModelDataset([row('2026-03',1000),row('2026-01',1),row('2026-02',3)], {
      testStart:'2026-03', testEnd:'2026-03', featureNames:['tvTrp'], standardize:true
    });
    expect(result.errors).toEqual([]);
    expect(result.train.map(r => r.period)).toEqual(['2026-01','2026-02']);
    expect(result.trainMean).toEqual([2]);
    expect(result.trainStd).toEqual([1]);
    expect(result.test[0].x).toEqual([998]);
  });
  it('rejects missing predictors and duplicate panel-month', () => {
    expect(prepareTemporalModelDataset([row('2026-01',1),row('2026-01',2),row('2026-02',3)], {testStart:'2026-02',testEnd:'2026-02'}).errors.join(' ')).toContain('Дублирующая');
    expect(prepareTemporalModelDataset([row('2026-01',1),row('2026-02',3)], {testStart:'2026-02',testEnd:'2026-02',featureNames:['marketRevenueRub']}).errors.join(' ')).toContain('Отсутствует');
  });
  it('rejects future rows, empty train, and invalid dates', () => {
    expect(prepareTemporalModelDataset([row('2026-01',1),row('2026-04',2)], {testStart:'2026-02',testEnd:'2026-03'}).errors.join(' ')).toContain('после тестового');
    expect(prepareTemporalModelDataset([row('2026-02',2)], {testStart:'2026-02',testEnd:'2026-02'}).errors.join(' ')).toContain('обучающих');
    expect(prepareTemporalModelDataset([], {testStart:'2026-13',testEnd:'2026-12'}).errors.join(' ')).toContain('границы');
  });
  it('allows same month across distinct panels', () => {
    const result = prepareTemporalModelDataset([row('2026-01',1),row('2026-01',2,'S'),row('2026-02',3)], {testStart:'2026-02',testEnd:'2026-02'});
    expect(result.errors).toEqual([]);
    expect(result.train).toHaveLength(2);
  });
});
