/** Facts are visible to analytics only when their datasetVersion matches the project's active pointer. */
export interface VersionedFact {
  id: string;
  projectId: string;
  datasetVersion: string;
}
import type { SalesFact, MarketFact, PromoFact, TvFact, VisitFact } from '../../domain/shared/facts';

/** Each persisted store retains its domain contract across snapshot reads. */
export interface FactByStore {
  salesFacts: SalesFact;
  marketFacts: MarketFact;
  promoFacts: PromoFact;
  tvFacts: TvFact;
  visitFacts: VisitFact;
}
export type FactStoreName = keyof FactByStore;
export type FactSnapshot = { [K in FactStoreName]: FactByStore[K][] };
