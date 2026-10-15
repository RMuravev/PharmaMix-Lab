import { describe, expect, it } from 'vitest';
import { buildCompleteExposurePanel } from './completeExposurePanelService';
describe('completeExposurePanelService', () => {
  const scope = { eligibleUnits: ['A', 'B'], calendar: ['2026-01', '2026-02'] };
  it('fills missing source fields and whole rows with true zeros', () => {
    const result = buildCompleteExposurePanel([{unitId:'A',period:'2026-01',salesRub:100,weightedVisits:2}], scope);
    expect(result.rows).toHaveLength(4);
    expect(result.insertedZeroRows).toBe(3);
    expect(result.filledZeroFields).toBe(3);
    expect(result.rows.find(r=>r.unitId==='B'&&r.period==='2026-01')?.salesRub).toBe(0);
    expect(result.rows[0].promoBonusRub).toBe(0);
  });
  it('rejects observations outside the explicit scope', () => {
    expect(()=>buildCompleteExposurePanel([{unitId:'C',period:'2026-01',salesRub:1}],scope)).toThrow(/охвата/);
  });
  it('rejects duplicates rather than silently double counting', () => {
    const row={unitId:'A',period:'2026-01',salesRub:1};
    expect(()=>buildCompleteExposurePanel([row,row],scope)).toThrow(/Дубликат/);
  });
  it('rejects invalid and negative measures', () => {
    expect(()=>buildCompleteExposurePanel([{unitId:'A',period:'2026-01',weightedVisits:-1}],scope)).toThrow(/Недопустимое/);
  });
  it('limits accidental cartesian expansion', () => {
    expect(()=>buildCompleteExposurePanel([], {...scope,maxCells:3})).toThrow(/лимит/);
  });
});
