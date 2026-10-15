import { describe, expect, it } from 'vitest';
import { VersionedSnapshotBuilder } from './versionedSnapshotBuilder';

const emptySources = () => ({ sales: [], market: [], promo: [], tv: [], visits: [] });

describe('VersionedSnapshotBuilder', () => {
  const builder = new VersionedSnapshotBuilder();

  it('requires all five sources to be explicit before preparing a snapshot', () => {
    expect(() => builder.build('p1', { sales: [], market: [], promo: [], tv: [] })).toThrow('источник «visits»');
  });

  it('normalizes all sources without mutating inputs and returns per-source reports', () => {
    const sources = {
      ...emptySources(),
      sales: [{ 'год-месяц': '2026-01', регион: 'Москва', бренд: 'A', скю: 'A-1', 'продажи в штуках': 10, 'продажи в рублях': 1200 }],
      market: [{ 'год-месяц': '2026-01', 'адресный рынок': 'Рынок 1', бренд: 'A', скю: 'A-1', регион: 'Москва', 'продажи в штуках': 10, 'продажи в рублях': 1200 }],
      promo: [{ 'год-месяц': '2026-01', сеть: 'Сеть 1', бренд: 'A', скю: 'A-1', '% инвестиций': 5, 'механика промо': 'Бонус за sell-out' }],
      tv: [{ 'год-месяц': '2026-01', бренд: 'A', TRP: 100 }],
      visits: [{ 'год-месяц': '2026-01', регион: 'Москва', бренд: 'A', 'количество визитов (взвешенное)': 12 }],
    };
    const result = builder.build('p1', sources);
    expect(result.totalAcceptedRows).toBe(5);
    expect(result.totalSkippedRows).toBe(0);
    expect(result.facts.salesFacts[0]).toMatchObject({ projectId: 'p1', brand: 'A', datasetVersion: 'pending' });
    expect(result.facts.promoFacts[0]).toMatchObject({ bonusRatePct: 5, promoMechanic: 'Бонус за sell-out' });
    expect(result.reports.map(report => report.source)).toEqual(['sales', 'market', 'promo', 'tv', 'visits']);
  });

  it('reports invalid rows without writing or hiding validation issues', () => {
    const result = builder.build('p1', { ...emptySources(), sales: [{ brand: 'missing fields' }] });
    expect(result.totalAcceptedRows).toBe(0);
    expect(result.totalSkippedRows).toBe(1);
    expect(result.reports.find(report => report.source === 'sales')?.issues.length).toBeGreaterThan(0);
  });
});
