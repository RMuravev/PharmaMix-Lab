import { trainTemporalMmm, type TemporalMmmFit } from './temporalMmmTrainingService';
import { tuneTemporalRidge, type RidgeTuningResult } from './temporalRidgeTuningService';
import type { TemporalDatasetResult } from './temporalModelDatasetService';

export interface TemporalModelComparison {
  ols: TemporalMmmFit | null;
  ridge: RidgeTuningResult;
  ranking: Array<{ model: 'ols' | 'ridge'; wapePct: number | null; rmse: number }>;
  warnings: string[];
}
/** Both candidates use exactly the same immutable outer test rows; OLS may be unidentifiable. */
export function compareTemporalModels(dataset: TemporalDatasetResult, lambdas: number[] = [0.01, 0.1, 1, 10, 100], options?: { minTrainMonths?: number; validationMonths?: number; folds?: number }): TemporalModelComparison {
  const ridge = tuneTemporalRidge(dataset, { lambdas, ...options });
  let ols: TemporalMmmFit | null = null;
  const warnings: string[] = [];
  try { ols = trainTemporalMmm(dataset, { model: 'ols' }); }
  catch (error) { warnings.push(`OLS недоступна: ${error instanceof Error ? error.message : String(error)}`); }
  const fits = [ols, ridge.finalFit].filter((f): f is TemporalMmmFit => f !== null);
  const identity = (f: TemporalMmmFit) => f.testPredictions.map(r => JSON.stringify([r.period, r.panelKey, r.actualRevenueRub]));
  const baseline = identity(ridge.finalFit);
  if (fits.some(f => JSON.stringify(identity(f)) !== JSON.stringify(baseline))) throw new Error('Модели используют разные тестовые наблюдения. Сравнение запрещено.');
  const ranking = fits.map(f => ({ model: f.model, wapePct: f.diagnostics.wapePct, rmse: f.diagnostics.rmse }))
    .sort((a,b) => (a.wapePct ?? Infinity) - (b.wapePct ?? Infinity) || a.rmse - b.rmse);
  return { ols, ridge, ranking, warnings: [...warnings, ...ridge.warnings, 'Сравнение OOS описательное: внешний тест не должен использоваться для выбора лагов, факторов или повторной настройки.'] };
}
