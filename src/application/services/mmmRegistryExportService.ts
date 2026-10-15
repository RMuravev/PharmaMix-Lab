import type { AnalysisRegistryRecord } from '../../infrastructure/indexeddb/analysisRegistryRepository';
import type { UnitMonthEffect } from './causalMmmPopulationAlignmentService';

/** Export MMM effects only for the exact treated unit-months of an existing causal study.
 * This is deliberately not an automatic calibration: estimand equivalence requires review.
 */
export function mmmEffectsToMatchedRegistryRecord(input: {
  causalRecord: AnalysisRegistryRecord;
  mmmUnitMonths: UnitMonthEffect[];
  id: string;
  createdAt: string;
  algorithmVersion: string;
  exposureDefinitionVerified: boolean;
}): AnalysisRegistryRecord {
  const {causalRecord: causal, mmmUnitMonths: rows} = input;
  if (causal.kind !== 'causal' || causal.effect.source !== 'causal' ||
      !causal.algorithmVersion.startsWith('matched-did-') ||
      !input.exposureDefinitionVerified)
    throw new Error('Требуется matched DiD и явное подтверждение эквивалентности воздействия.');
  if (!input.id.trim() || !input.algorithmVersion.trim() || !Number.isFinite(Date.parse(input.createdAt)))
    throw new Error('Некорректные метаданные расчёта MMM.');
  let scope: {treatedUnits: string[]; postMonths: string[]};
  try { scope = JSON.parse(causal.effect.populationKey) as typeof scope; }
  catch { throw new Error('Не удалось прочитать охват causal-оценки.'); }
  if (!Array.isArray(scope.treatedUnits) || !Array.isArray(scope.postMonths) ||
      !scope.treatedUnits.length || !scope.postMonths.length ||
      scope.treatedUnits.some(u=>typeof u !== 'string' || !u.trim()) ||
      scope.postMonths.some(p=>typeof p !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(p)) ||
      new Set(scope.treatedUnits).size !== scope.treatedUnits.length ||
      new Set(scope.postMonths).size !== scope.postMonths.length)
    throw new Error('Некорректный охват causal-оценки.');
  const expected = new Set(scope.treatedUnits.flatMap(u=>scope.postMonths.map(p=>JSON.stringify([u,p]))));
  if (expected.size !== causal.effect.unitMonths || rows.length !== expected.size)
    throw new Error('Число единиц-месяцев MMM не соответствует causal-оценке.');
  const seen = new Set<string>(); let total = 0;
  for (const row of rows) {
    const key = JSON.stringify([row.unitId,row.period]);
    if (!expected.has(key) || seen.has(key) || !Number.isFinite(row.incremental))
      throw new Error('MMM содержит пропуск, дубликат или наблюдение вне causal-охвата.');
    seen.add(key); total += row.incremental;
  }
  if (!Number.isFinite(total)) throw new Error('Переполнение суммарного эффекта MMM.');
  return {
    id: input.id, projectId: causal.projectId, datasetVersion: causal.datasetVersion,
    kind: 'mmm', createdAt: input.createdAt, algorithmVersion: input.algorithmVersion,
    definition: causal.definition,
    effect: {...causal.effect, source:'mmm', incrementalTotal:total, ci95:null},
  };
}
