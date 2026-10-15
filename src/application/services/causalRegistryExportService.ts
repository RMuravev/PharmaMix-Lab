import type { MatchedLiftResult } from './causalLiftPipelineService';
import type { AnalysisRegistryRecord } from '../../infrastructure/indexeddb/analysisRegistryRepository';

/** Export only an observed matched-DiD estimate; never silently relabel it as staggered ATT. */
export function matchedLiftToRegistryRecord(input: {
  result: MatchedLiftResult; projectId: string; datasetVersion: string;
  treatmentStart: string; brand: string; grain: string; id: string; createdAt: string;
}): AnalysisRegistryRecord {
  const {result,projectId,datasetVersion,treatmentStart,brand,grain,id,createdAt}=input;
  if (!projectId.trim() || !datasetVersion.trim() || !brand.trim() || !grain.trim() || !id.trim() ||
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(treatmentStart) ||
    !result.pairs.length || !result.postPeriods.length || !Number.isFinite(result.liftPerUnitMonth) ||
    result.postPeriods.some(p => p < treatmentStart) ||
    result.driver === 'promoBonusRub') throw new Error('Невозможно экспортировать эту оценку matched DiD.');
  const driver = result.driver === 'promoActive' ? 'promoActive' : 'weightedVisits';
  const units = result.pairs.map(p => p.treatedUnit).sort();
  if (new Set(units).size !== units.length) throw new Error('Повторяющиеся единицы воздействия.');
  const post = [...result.postPeriods].sort();
  if (new Set(post).size !== post.length) throw new Error('Повторяющиеся месяцы после воздействия.');
  const factor = units.length * post.length;
  const ci95 = result.ci95 ? [result.ci95[0]*factor,result.ci95[1]*factor] as [number,number] : null;
  return {
    id,projectId,datasetVersion,kind:'causal',createdAt,
    algorithmVersion:'matched-did-v1',
    definition:`matched-did:${driver}:brand=${JSON.stringify(brand)}:grain=${grain}:start=${treatmentStart}`,
    effect: {
      source:'causal',driver,outcome:result.outcome,
      periodStart:post[0],periodEnd:post[post.length-1],
      populationKey:JSON.stringify({treatedUnits:units,postMonths:post}),
      incrementalTotal:result.liftPerUnitMonth*factor,unitMonths:factor,ci95,
    },
  };
}
