import { calculateRegressionDiagnostics, type RegressionDiagnostics } from './regressionDiagnosticsService';

export interface ModelEvaluationInput {
  modelId: string;
  /** Stable identifier for the exact held-out temporal window. */
  testWindowId: string;
  actual: number[];
  predicted: number[];
  predictorCount?: number;
}

export interface ModelComparisonRow {
  modelId: string;
  testWindowId: string;
  diagnostics: RegressionDiagnostics;
  rank: number;
}

/**
 * Compares models only when they were evaluated on the same temporal window
 * and the same ordered actual observations. Lower WAPE is preferred; when
 * WAPE is undefined, RMSE is used as a fallback tie-breaker/ranking metric.
 */
export function compareModelsOnSameTestWindow(models: ModelEvaluationInput[]): ModelComparisonRow[] {
  if (!Array.isArray(models) || models.length === 0) {
    throw new Error('Для сравнения нужна хотя бы одна модель.');
  }
  const ids = new Set<string>();
  for (const model of models) {
    if (!model.modelId?.trim()) throw new Error('У каждой модели должен быть modelId.');
    if (ids.has(model.modelId)) throw new Error(`Повторяется modelId: ${model.modelId}`);
    ids.add(model.modelId);
    if (!model.testWindowId?.trim()) throw new Error(`У модели ${model.modelId} не задан testWindowId.`);
  }

  const windowId = models[0].testWindowId;
  if (models.some((model) => model.testWindowId !== windowId)) {
    throw new Error('Нельзя сравнивать модели, оценённые на разных testWindowId.');
  }
  const baselineActual = models[0].actual;
  if (!Array.isArray(baselineActual) || baselineActual.length === 0) {
    throw new Error('Фактические значения тестового окна должны быть непустым массивом.');
  }
  for (const model of models) {
    if (!Array.isArray(model.actual) || model.actual.length !== baselineActual.length ||
      model.actual.some((value, index) => value !== baselineActual[index])) {
      throw new Error('Для честного сравнения фактические значения и их порядок должны совпадать у всех моделей.');
    }
  }

  const evaluated = models.map((model) => ({
    modelId: model.modelId,
    testWindowId: model.testWindowId,
    diagnostics: calculateRegressionDiagnostics({
      actual: model.actual,
      predicted: model.predicted,
      predictorCount: model.predictorCount,
    }),
  }));
  evaluated.sort((a, b) => {
    const aw = a.diagnostics.wapePct;
    const bw = b.diagnostics.wapePct;
    if (aw !== null && bw !== null && aw !== bw) return aw - bw;
    if (aw !== null && bw === null) return -1;
    if (aw === null && bw !== null) return 1;
    return a.diagnostics.rmse - b.diagnostics.rmse;
  });

  return evaluated.map((row, index) => ({ ...row, rank: index + 1 }));
}
