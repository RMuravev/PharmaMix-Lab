import type { FactStoreName, VersionedFact } from '../contracts/versionedFacts';
import { normalizeSalesRows } from './salesNormalizer';
import { normalizeMarketRows } from './marketNormalizer';
import { normalizePromoRows } from './promoNormalizer';
import { normalizeTvRows, normalizeVisitRows } from './channelExposureNormalizer';

export type SnapshotSourceName = 'sales' | 'market' | 'promo' | 'tv' | 'visits';
export type SnapshotSourceRows = Record<SnapshotSourceName, readonly unknown[]>;
export interface SnapshotSourceReport {
  source: SnapshotSourceName;
  inputRows: number;
  acceptedRows: number;
  skippedRows: number;
  fingerprint: string;
  issues: Array<{ row: number; field: string; message: string }>;
}
export interface BuiltVersionedSnapshot {
  facts: Record<FactStoreName, VersionedFact[]>;
  reports: SnapshotSourceReport[];
  totalInputRows: number;
  totalAcceptedRows: number;
  totalSkippedRows: number;
}

const REQUIRED_SOURCES: SnapshotSourceName[] = ['sales', 'market', 'promo', 'tv', 'visits'];

/** Pure normalization boundary: does not open IndexedDB or mutate published facts. */
export class VersionedSnapshotBuilder {
  build(projectId: string, sources: Partial<SnapshotSourceRows>): BuiltVersionedSnapshot {
    if (!projectId.trim()) throw new Error('Перед подготовкой снимка необходимо выбрать проект.');
    for (const source of REQUIRED_SOURCES) {
      if (!Object.prototype.hasOwnProperty.call(sources, source) || !Array.isArray(sources[source])) {
        throw new Error(`Для полного снимка необходимо явно передать источник «${source}» (если он пуст, передайте []).`);
      }
    }

    const complete = sources as SnapshotSourceRows;
    const sales = normalizeSalesRows(complete.sales, projectId, 'pending');
    const market = normalizeMarketRows(complete.market, projectId, 'pending');
    const promo = normalizePromoRows(complete.promo, projectId, 'pending');
    const tv = normalizeTvRows(complete.tv, projectId, 'pending');
    const visits = normalizeVisitRows(complete.visits, projectId, 'pending');

    const facts: BuiltVersionedSnapshot['facts'] = {
      salesFacts: sales.facts as unknown as VersionedFact[],
      marketFacts: market.facts as unknown as VersionedFact[],
      promoFacts: promo.facts as unknown as VersionedFact[],
      tvFacts: tv.facts as unknown as VersionedFact[],
      visitFacts: visits.facts as unknown as VersionedFact[],
    };
    const reports: SnapshotSourceReport[] = [
      { source: 'sales', inputRows: complete.sales.length, acceptedRows: sales.facts.length, skippedRows: sales.skippedRows, fingerprint: sales.fingerprint, issues: sales.issues },
      { source: 'market', inputRows: complete.market.length, acceptedRows: market.facts.length, skippedRows: market.skippedRows, fingerprint: market.fingerprint, issues: market.issues },
      { source: 'promo', inputRows: complete.promo.length, acceptedRows: promo.facts.length, skippedRows: promo.skippedRows, fingerprint: promo.fingerprint, issues: promo.issues },
      { source: 'tv', inputRows: complete.tv.length, acceptedRows: tv.facts.length, skippedRows: tv.skippedRows, fingerprint: tv.fingerprint, issues: tv.issues },
      { source: 'visits', inputRows: complete.visits.length, acceptedRows: visits.facts.length, skippedRows: visits.skippedRows, fingerprint: visits.fingerprint, issues: visits.issues },
    ];
    return {
      facts,
      reports,
      totalInputRows: reports.reduce((sum, report) => sum + report.inputRows, 0),
      totalAcceptedRows: reports.reduce((sum, report) => sum + report.acceptedRows, 0),
      totalSkippedRows: reports.reduce((sum, report) => sum + report.skippedRows, 0),
    };
  }
}
