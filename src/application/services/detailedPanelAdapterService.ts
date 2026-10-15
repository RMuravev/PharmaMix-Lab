import type { PanelRecord } from '../../types/pharma';
import type { PreparedPanelRow } from './panelSalesPreparationService';

/** A sales-only adapter. Other MMM covariates MUST be joined at their proper
 * geographical grain before fitting; zeros here mean unavailable, not observed.
 * Therefore these rows are NOT eligible for the existing MMM fitter.
 */
export interface DetailedSalesObservation {
  brand: string;
  region: string;
  chain: string;
  month: string;
  units: number;
  salesRub: number;
  seriesId: string;
}

export function toDetailedSalesObservations(rows: PreparedPanelRow[]): DetailedSalesObservation[] {
  return rows.map(r => ({
    brand: r.brand, region: r.region, chain: r.chain, month: r.month,
    units: r.units, salesRub: r.salesRub,
    seriesId: JSON.stringify([r.brand, r.region, r.chain])
  })).sort((a, b) => a.seriesId.localeCompare(b.seriesId) || a.month.localeCompare(b.month));
}

/** Legacy MMM explicitly refuses granular data until promo, TV, visits and
 * market signals have been reconciled to the same grain. */
export function assertLegacyPanelGrain(rows: PanelRecord[]): void {
  if (rows.some(r => r.region !== undefined || r.chain !== undefined)) {
    throw new Error('Гранулярные панели нельзя подавать в legacy MMM без согласования факторов по региону и сети.');
  }
}
