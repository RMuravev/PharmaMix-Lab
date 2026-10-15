import { describe, it, expect } from 'vitest';
import { validateOOSPreflight } from './oosPreflightService';
describe('OOS preflight', () => {
  const rows = [
    {brand:'A',month:'2026-01',salesRub:100}, {brand:'A',month:'2026-02',salesRub:120},
    {brand:'B',month:'2026-01',salesRub:80}, {brand:'B',month:'2026-02',salesRub:90},
  ];
  it('accepts complete brand-month holdout', () => expect(validateOOSPreflight(rows,['2026-01','2026-02']).valid).toBe(true));
  it('rejects a missing month in one brand', () => expect(validateOOSPreflight(rows.slice(0,3),['2026-01','2026-02']).errors.some(e => e.includes('B / 2026-02'))).toBe(true));
  it('rejects filtered zero sales', () => expect(validateOOSPreflight([{...rows[0],salesRub:0},...rows.slice(1)],['2026-01','2026-02']).valid).toBe(false));
  it('rejects duplicate keys', () => expect(validateOOSPreflight([...rows,rows[0]],['2026-01','2026-02']).valid).toBe(false));
});
