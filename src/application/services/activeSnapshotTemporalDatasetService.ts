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
  if (!datasetVersion) errors.push('Для MMM требуется опубликованная активная версия всех источников данных.');
  if (!snapshot.salesFacts.length) errors.push('В активном наборе нет продаж.');
  const requested=options.featureNames??['tvTrp','weightedVisits','bonusEstimateRub'];
  if(requested.includes('bonusEstimateRub')&&snapshot.sourceAvailability?.promo.status==='NOT_PROVIDED')errors.push('Promo is NOT_PROVIDED; promo-dependent MMM features are unavailable and cannot be replaced with zero exposure.');
  if(requested.includes('weightedVisits')&&snapshot.sourceAvailability?.visits.status==='NOT_PROVIDED')errors.push('Visits are NOT_PROVIDED; visits-dependent MMM features are unavailable.');
  const salesPeriods=[...new Set(snapshot.salesFacts.map(row=>row.period))];
  for(const [feature,source] of [['bonusEstimateRub','promo'],['weightedVisits','visits']] as const){const availability=snapshot.sourceAvailability?.[source];if(requested.includes(feature)&&availability&&availability.status!=='NOT_PROVIDED'&&(!availability.coverage||salesPeriods.some(period=>!availability.coverage!.periods.includes(period))))errors.push(`${source} coverage does not contain every Sales period; zero exposure cannot be restored outside declared coverage.`);}
  // Promo and visits are zero exposure when their rows are absent inside the panel.
  // TV has no equivalent zero-source contract and remains unavailable when absent.
  if (!snapshot.tvFacts.length && requested.includes('tvTrp')) {
    warnings.push('Источник «TV» пуст; фактор tvTrp останется недоступен для выбранной модели.');
  }
  if (!snapshot.visitFacts.length) warnings.push('Источник «визиты» пуст; внутри панели weightedVisits принудительно равен нулю.');
  if (!snapshot.promoFacts.length) warnings.push('Источник «промо» пуст; внутри панели promo bonus равен нулю.');
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
