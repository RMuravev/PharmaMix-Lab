import { describe, expect, it } from 'vitest';
import { buildPanelDesignMatrix } from './panelDesignMatrixService';
import type { AlignedPanel } from './panelSourceAlignmentService';
const panel = (period: string, region: string, chain: string, tvTrp: number): AlignedPanel => ({ period, brand: 'A', region, chain, revenueRub: 100, units: 1, bonusEstimateRub: 10, tvTrp, weightedVisits: 3, marketRevenueRub: null });
describe('buildPanelDesignMatrix', () => {
  it('uses prior months only and never substitutes a different region or chain', () => {
    const result = buildPanelDesignMatrix([panel('2026-01','N','X',5), panel('2026-02','N','X',8), panel('2026-02','S','Y',8)], { lags: { tvTrp: 1, weightedVisits: 1, bonusEstimateRub: 1 } });
    expect(result.errors).toEqual([]);
    expect(result.rows[1].features).toEqual({ tvTrp: 5, weightedVisits: 3, bonusEstimateRub: 10, marketRevenueRub: null });
    expect(result.rows[2].features.weightedVisits).toBeNull();
    expect(result.rows[2].features.bonusEstimateRub).toBeNull();
  });
  it('does not treat missing months as consecutive observations', () => {
    const result = buildPanelDesignMatrix([panel('2026-01','N','X',5), panel('2026-03','N','X',8)], { lags: { tvTrp: 1 } });
    expect(result.rows[1].features.tvTrp).toBeNull();
  });
  it('rejects inconsistent shared TV signals and duplicate panels', () => {
    expect(buildPanelDesignMatrix([panel('2026-01','N','X',5), panel('2026-01','S','Y',7)]).errors.join(' ')).toContain('Противоречивый');
    expect(buildPanelDesignMatrix([panel('2026-01','N','X',5), panel('2026-01','N','X',5)]).errors.join(' ')).toContain('Дублирующая');
  });
  it('rejects negative lags and can exclude incomplete history', () => {
    expect(buildPanelDesignMatrix([], { lags: { tvTrp: -1 } }).errors).toHaveLength(1);
    const result = buildPanelDesignMatrix([panel('2026-01','N','X',5)], { lags: { tvTrp: 1 }, requireCompleteHistory: true });
    expect(result.rows).toHaveLength(0);
    expect(result.excludedRows).toBe(1);
  });
});
