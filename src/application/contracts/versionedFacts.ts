/** Facts are visible to analytics only when their datasetVersion matches the project's active pointer. */
export interface VersionedFact {
  id: string;
  projectId: string;
  datasetVersion: string;
}
export type FactStoreName = 'salesFacts' | 'marketFacts' | 'promoFacts' | 'tvFacts' | 'visitFacts';
