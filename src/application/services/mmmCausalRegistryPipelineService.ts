import type { AlignedPanel } from './panelSourceAlignmentService';
import type { CarryoverSettings } from './marketingCarryoverOptimizationService';
import type { HillSettings } from './marketingHillCvService';
import type { TemporalMmmFit } from './temporalMmmTrainingService';
import type { AnalysisRegistryRecord } from '../../infrastructure/indexeddb/analysisRegistryRepository';
import { saveAnalysisResult, compatibleRegistryPair } from '../../infrastructure/indexeddb/analysisRegistryRepository';
import { calculateMarketingTrajectoryCounterfactuals } from './marketingTrajectoryCounterfactualService';
import { aggregateMmmTrajectoryToCausalUnits } from './mmmCausalUnitAggregationService';
import { mmmEffectsToMatchedRegistryRecord } from './mmmRegistryExportService';

/** Explicit orchestration. Never interpret a causal effect as equivalent to an MMM intervention automatically. */
export interface MmmCausalRegistryPipelineInput {
  panels: AlignedPanel[];
  fit: Pick<TemporalMmmFit,'featureNames'|'coefficients'>;
  carryover: CarryoverSettings;
  hill: HillSettings;
  causalRecord: AnalysisRegistryRecord;
  unitForPanel: (panel: {brand:string;region:string;chain:string}) => string | null;
  disjointSalesPanelsVerified: boolean;
  exposureDefinitionVerified: boolean;
  id: string;
  createdAt: string;
  algorithmVersion: string;
  trainMean?: number[];
  trainStd?: number[];
  /** First month of intervention; mandatory to avoid silently using never-treated history. */
  interventionStartPeriod: string;
}

export function prepareMmmCausalRegistryResult(input: MmmCausalRegistryPipelineInput): {record:AnalysisRegistryRecord;warnings:string[]} {
  const causal = input.causalRecord;
  if (causal.kind !== 'causal' || causal.effect.outcome !== 'salesRub')
    throw new Error('Для автоматического сопоставления требуется causal-оценка выручки в рублях.');
  const driver = causal.effect.driver === 'promoActive' ? 'bonusEstimateRub' :
    causal.effect.driver === 'weightedVisits' ? 'weightedVisits' : null;
  if (!driver) throw new Error('Драйвер causal-оценки не поддерживается MMM.');
  let scope: {treatedUnits:string[];postMonths:string[]};
  try { scope = JSON.parse(causal.effect.populationKey); }
  catch { throw new Error('Не удалось прочитать охват causal-оценки.'); }
  if (!Array.isArray(scope?.treatedUnits) || !Array.isArray(scope?.postMonths) ||
      !scope.treatedUnits.length || !scope.postMonths.length ||
      scope.treatedUnits.some(u=>typeof u !== 'string' || !u.trim()) ||
      scope.postMonths.some(p=>typeof p !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(p)))
    throw new Error('Некорректный охват causal-оценки.');
  const periods = [...scope.postMonths].sort();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.interventionStartPeriod) ||
      input.interventionStartPeriod > periods[0])
    throw new Error('Начало вмешательства должно быть не позднее первого оцениваемого месяца.');
  const trajectory = calculateMarketingTrajectoryCounterfactuals(input.panels,input.fit,input.carryover,input.hill,{
    start:periods[0],end:periods[periods.length-1],drivers:[driver],
    trainMean:input.trainMean,trainStd:input.trainStd,
    interventionStart:input.interventionStartPeriod,
  });
  const expectedUnitMonths = scope.treatedUnits.flatMap(unitId=>scope.postMonths.map(period=>({unitId,period})));
  const aggregated = aggregateMmmTrajectoryToCausalUnits({
    effects:trajectory.effects,driver,unitForPanel:input.unitForPanel,
    expectedUnitMonths,disjointSalesPanelsVerified:input.disjointSalesPanelsVerified,
  });
  const record = mmmEffectsToMatchedRegistryRecord({
    causalRecord:causal,mmmUnitMonths:aggregated,id:input.id,
    createdAt:input.createdAt,algorithmVersion:input.algorithmVersion,
    exposureDefinitionVerified:input.exposureDefinitionVerified,
  });
  if (!compatibleRegistryPair(causal,record)) throw new Error('Результаты MMM и Causal Lift не сопоставимы по метаданным.');
  return {record,warnings:[...trajectory.warnings,
    'Сопоставимость подтверждена пользователем, но не установлена статистически.',
    `MMM отключает воздействие с ${input.interventionStartPeriod}, сохраняя более раннюю историю; для staggered cohorts нужен отдельный старт для каждой когорты.`,
    'Экспорт не калибрует коэффициенты MMM и не изменяет обученную модель.']};
}

/** Saving is intentionally separate from calculation; no partially persisted results on validation failure. */
export async function savePreparedMmmCausalRegistryResult(input:MmmCausalRegistryPipelineInput) {
  const prepared = prepareMmmCausalRegistryResult(input);
  await saveAnalysisResult(prepared.record);
  return prepared;
}
