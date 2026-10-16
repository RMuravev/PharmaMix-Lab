import type { SnapshotSourceName } from '../services/versionedSnapshotBuilder';
export type SourceAvailabilityStatus='LOADED'|'KNOWN_EMPTY'|'NOT_PROVIDED';
export interface SourceCoverage{startPeriod:string;endPeriod:string;periods:string[]}
export interface SourceAvailability{source:SnapshotSourceName;status:SourceAvailabilityStatus;coverage:SourceCoverage|null}
export type SourceAvailabilityMap=Record<SnapshotSourceName,SourceAvailability>;
export const SOURCE_NAMES:SnapshotSourceName[]=['sales','market','promo','tv','visits'];
export function coverageFromPeriods(periods:string[]):SourceCoverage|null{const sorted=[...new Set(periods)].sort();return sorted.length?{startPeriod:sorted[0],endPeriod:sorted.at(-1)!,periods:sorted}:null;}
