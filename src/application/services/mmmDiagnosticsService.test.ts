import { describe, expect, it } from 'vitest';
import { diagnoseMmmDataset } from './mmmDiagnosticsService';
const row = (period: string, x: number[]) => ({ period, panelKey: 'p', actualRevenueRub: 100, x });
describe('MMM diagnostics', () => {
  it('detects temporal overlap and reports coverage', () => {
    const r = diagnoseMmmDataset({ train: [row('2025-01',[1,1])], test: [row('2025-01',[1,1])], featureNames: ['tvTrp','weightedVisits'], trainMean: [], trainStd: [], errors: [], warnings: [] }, ['2025-01','2025-02'], ['2025-01','2025-02']);
    expect(r.valid).toBe(false); expect(r.overlapPeriods).toEqual(['2025-01']); expect(r.trainCoveragePct).toBe(50);
  });
  it('flags collinearity and short samples without changing formulas', () => {
    const rows = Array.from({length: 8}, (_, i) => row(`2025-${String(i+1).padStart(2,'0')}`, [i, i * 2]));
    const r = diagnoseMmmDataset({ train: rows.slice(0,6), test: rows.slice(6), featureNames: ['tvTrp','weightedVisits'], trainMean: [], trainStd: [], errors: [], warnings: [] });
    expect(r.warnings.some(x => x.includes('Мультиколлинеарность'))).toBe(true); expect(r.limitations.length).toBeGreaterThan(0);
  });
});
