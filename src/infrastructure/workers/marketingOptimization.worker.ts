/// <reference lib="webworker" />
import { optimizeMarketingCarryover, applyMarketingCarryover } from '../../application/services/marketingCarryoverOptimizationService';
import { optimizeMarketingHill, applyMarketingHill } from '../../application/services/marketingHillCvService';
import { buildPanelDesignMatrix } from '../../application/services/panelDesignMatrixService';
import { prepareTemporalModelDataset } from '../../application/services/temporalModelDatasetService';
import { assessMarketingHillStability } from '../../application/services/marketingHillStabilityService';
import type { AlignedPanel } from '../../application/services/panelSourceAlignmentService';

type Request = { action?: 'optimize' | 'stability'; panels: AlignedPanel[]; testStart: string; testEnd: string; lambdas: number[] };
const scope: DedicatedWorkerGlobalScope = self as DedicatedWorkerGlobalScope;
scope.onmessage = (event: MessageEvent<Request>) => {
  try {
    const { panels, testStart, testEnd, lambdas } = event.data;
    if (event.data.action === 'stability') {
      const stability = assessMarketingHillStability(panels, {testStart,testEnd,lambdas,
        onProgress:(completed,total)=>scope.postMessage({type:'progress',phase:'hill-stability',percent:Math.round(100*completed/total),completed,total})});
      scope.postMessage({type:'stability-done',stability});
      return;
    }
    scope.postMessage({ type: 'progress', phase: 'carryover', percent: 0 });
    const search = optimizeMarketingCarryover(panels, { testStart, testEnd, lambdas, onProgress: (completed, total) => {
      if (completed === total || completed % Math.max(1, Math.ceil(total / 50)) === 0) scope.postMessage({ type: 'progress', phase: 'carryover', percent: Math.round(55 * completed / total), completed, total });
    } });
    scope.postMessage({ type: 'progress', phase: 'hill', percent: 55 });
    const hill = optimizeMarketingHill(panels, { carryover: search.best.settings, testStart, testEnd, lambda: search.best.lambda, onProgress: (completed, total) => {
      scope.postMessage({ type: 'progress', phase: 'hill', percent: 55 + Math.round(35 * completed / total), completed, total });
    } });
    scope.postMessage({ type: 'progress', phase: 'dataset', percent: 90 });
    const matrix = buildPanelDesignMatrix(applyMarketingHill(applyMarketingCarryover(panels, search.best.settings), hill.settings));
    if (matrix.errors.length) throw new Error(matrix.errors.join(' | '));
    const dataset = prepareTemporalModelDataset(matrix.rows, { testStart, testEnd, standardize: false });
    if (dataset.errors.length) throw new Error(dataset.errors.join(' | '));
    scope.postMessage({ type: 'done', search, hill, dataset });
  } catch (error) {
    scope.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};
