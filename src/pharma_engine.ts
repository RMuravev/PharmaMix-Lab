/**
 * PharmaMix Lab v3.1 Engine Facade
 * 
 * Архитектурный фасад: делегирует выполнение независимым расчетным модулям:
 * - data-ingestion (csvParser, partitionManager, calendarBuilder, demoGenerator)
 * - data-quality (qualityAuditor)
 * - promo-engine (promoBaseline, promoFinancials)
 * - mmm-engine (regression, vifCheck, tcnModel, hierarchicalRegression, lagOptimization)
 * - causal-inference (geoAbExperiment, placeboValidation, preTrendTest, clusteredErrors)
 * - forecasting (oosValidator)
 * - budget-optimizer (budgetOptimizer)
 * - ui (chartRenderer, renderAdapter)
 */

import { store } from './core/store';
import { setupUIRenderAdapter } from './ui/renderAdapter';
import { setupMLCenterEventListeners, runGeoABExperimentUI } from './ui/sections/MLSection';

export { store } from './core/store';
export * from './types/pharma';
export * from './utils/math';
export * from './modules/data-ingestion/csvParser';
export * from './modules/data-ingestion/demoGenerator';
export * from './modules/data-ingestion/calendarBuilder';
export * from './modules/data-ingestion/partitionManager';
export * from './modules/data-quality/qualityAuditor';
export * from './modules/promo-engine/promoBaseline';
export * from './modules/promo-engine/promoFinancials';
export * from './modules/mmm-engine/regression';
export * from './modules/mmm-engine/vifCheck';
export * from './modules/mmm-engine/tcnModel';
export * from './modules/mmm-engine/hierarchicalRegression';
export * from './modules/mmm-engine/lagOptimization';
export * from './modules/mmm-engine/automlEngine';
export * from './utils/excelExporter';
export * from './utils/pdfGenerator';
export * from './modules/causal-inference/geoAbExperiment';
export * from './modules/causal-inference/placeboValidation';
export * from './modules/causal-inference/preTrendTest';
export * from './modules/causal-inference/clusteredErrors';
export * from './modules/forecasting/oosValidator';
export * from './modules/budget-optimizer/budgetOptimizer';
export * from './modules/seasonality-engine/seasonality_engine';
export * from './ui/chartRenderer';
export * from './ui/renderAdapter';
export * from './ui/sections/MLSection';

/**
 * Инициализирует приложение PharmaMix Lab, связывая DataStore и UI-адаптер.
 * Гарантирует корректную регистрацию слушателей событий для ML-Центра и Causal DiD.
 * Возвращает функцию очистки (teardown) для React useEffect.
 */
export function initPharmaMixApp(): () => void {
  const cleanupAdapter = setupUIRenderAdapter(store);
  const cleanupML = setupMLCenterEventListeners(store);
  return () => {
    if (cleanupAdapter) cleanupAdapter();
    if (cleanupML) cleanupML();
  };
}

