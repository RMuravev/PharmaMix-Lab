import { describe, expect, it } from 'vitest';
import { normalizeTvRows, normalizeVisitRows } from './channelExposureNormalizer';

describe('channel exposure normalizers', () => {
  it('normalizes TV TRP with Russian columns and decimal comma', () => {
    const result = normalizeTvRows([{ 'Год-месяц': '2025-2', 'Бренд': 'Brand A', 'TRP': '12,5' }], 'p1');
    expect(result.facts).toHaveLength(1);
    expect(result.facts[0]).toMatchObject({ period: '2025-02', brand: 'Brand A', trp: 12.5 });
    expect(result.skippedRows).toBe(0);
  });
  it('rejects negative TRP and invalid months', () => {
    const result = normalizeTvRows([{ period: '2025-13', brand: 'A', trp: -1 }], 'p1');
    expect(result.facts).toHaveLength(0);
    expect(result.issues.length).toBeGreaterThan(0);
  });
  it('normalizes weighted visits by region and brand', () => {
    const result = normalizeVisitRows([{ 'Год-месяц': '2025-02', Регион: 'Север', Город: 'Город', Бренд: 'A', 'Количество визитов (взвешенное)': '3 200,5' }], 'p1');
    expect(result.facts[0]).toMatchObject({ period: '2025-02', region: 'Север', city: 'Город', brand: 'A', weightedVisits: 3200.5 });
  });
  it('rejects visits without region or valid count', () => {
    expect(normalizeVisitRows([{ period: '2025-01', brand: 'A', visits: '-3' }], 'p1').facts).toHaveLength(0);
  });
});
