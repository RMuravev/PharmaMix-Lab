import type { ActiveDatasetSnapshot } from '../../infrastructure/indexeddb/activeDatasetSnapshotRepository';
import { alignPanelSources } from './panelSourceAlignmentService';
import { buildPanelDesignMatrix, type DesignMatrixOptions } from './panelDesignMatrixService';
import { prepareTemporalModelDataset, type PredictorName, type TemporalDatasetResult } from './temporalModelDatasetService';

export interface ActiveMmmOptions {
  testStart: string;
  testEnd: string;
  lags?: DesignMatrixOptions['lags'];
  featureNames?: PredictorName[];
}
export interface ActiveMmmPreparation {
  dataset: TemporalDatasetResult;
  datasetVersion: string;
  panelCount: number;
  unmatchedPromo: number;
  estimatedBonusRub: number;
  warnings: string[];
  errors: string[];
}
/** Prepare an MMM sample from one transaction-consistent active snapshot. */
export function prepareActiveSnapshotMmm(snapshot: ActiveDatasetSnapshot, options: ActiveMmmOptions): ActiveMmmPreparation {
  const errors: string[] = [], warnings: string[] = [];
  const datasetVersion = snapshot.datasetVersion ?? '';
  if (snapshot.legacy || !datasetVersion) errors.push('Для MMM требуется опубликованная активная версия всех источников данных.');
  if (!snapshot.salesFacts.length) errors.push('В активном наборе нет продаж.');
  // A missing source is not silently treated as a zero marketing signal.
  for (const [name, facts] of [['TV', snapshot.tvFacts], ['визиты', snapshot.visitFacts], ['промо', snapshot.promoFacts]] as const) {
    if (!facts.length) warnings.push(`Источник «${name}» пуст; при выборе соответствующего фактора расчёт будет заблокирован.`);
  }
  const empty: TemporalDatasetResult = { train: [], test: [], featureNames: options.featureNames ?? ['tvTrp','weightedVisits','bonusEstimateRub'], trainMean: [], trainStd: [], errors, warnings };
  if (errors.length) return { dataset: empty, datasetVersion, panelCount: 0, unmatchedPromo: 0, estimatedBonusRub: 0, warnings, errors };
  const aligned = alignPanelSources({
    sales: snapshot.salesFacts, promo: snapshot.promoFacts,
    tv: snapshot.tvFacts, visits: snapshot.visitFacts, market: snapshot.marketFacts,
  });
  errors.push(...aligned.errors); warnings.push(...aligned.warnings);
  const design = buildPanelDesignMatrix(aligned.panels, { lags: options.lags });
  errors.push(...design.errors); warnings.push(...design.warnings);
  if (errors.length) return { dataset: { ...empty, errors: [...errors], warnings: [...warnings] }, datasetVersion, panelCount: aligned.panels.length, unmatchedPromo: aligned.unmatchedPromo, estimatedBonusRub: aligned.totalBonusEstimateRub, warnings, errors };
  const dataset = prepareTemporalModelDataset(design.rows, { testStart: options.testStart, testEnd: options.testEnd, featureNames: options.featureNames, standardize: false });
  errors.push(...dataset.errors); warnings.push(...dataset.warnings);
  return { dataset: { ...dataset, errors: [...errors], warnings: [...warnings] }, datasetVersion, panelCount: aligned.panels.length, unmatchedPromo: aligned.unmatchedPromo, estimatedBonusRub: aligned.totalBonusEstimateRub, warnings, errors };
}
