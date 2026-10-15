import { Chart } from 'chart.js';
import { drawChart, drawContributionDecompositionChart, drawShapSummaryBarChart, drawShapBeeswarmChart, drawWaterfallChart, drawElasticityChart, drawSTLDecompositionChart, drawIllnessCorrelationChart } from '../chartRenderer';
import { getCanvas } from '../../utils/dom';

/**
 * Service to manage high-level chart rendering operations.
 */
export const chartService = {
  renderOverviewSales(canvasId: string, data: any, labels: string[]) {
    const canvas = getCanvas(canvasId);
    if (!canvas) return;
    drawChart(canvas, data, labels, { zero: true });
  },

  renderContributionDecomposition(canvasId: string, data: any[]) {
    const canvas = getCanvas(canvasId);
    if (!canvas) return;
    drawContributionDecompositionChart(canvas, data);
  },

  renderShapSummary(canvasId: string, data: any[]) {
    const canvas = getCanvas(canvasId);
    if (!canvas) return;
    drawShapSummaryBarChart(canvas, data);
  },

  renderShapBeeswarm(canvasId: string, data: any[]) {
    const canvas = getCanvas(canvasId);
    if (!canvas) return;
    drawShapBeeswarmChart(canvas, data);
  },

  renderWaterfall(canvasId: string, data: any[]) {
    const canvas = getCanvas(canvasId);
    if (!canvas) return;
    drawWaterfallChart(canvas, data);
  },

  renderElasticity(canvasId: string, data: any[]) {
    const canvas = getCanvas(canvasId);
    if (!canvas) return;
    drawElasticityChart(canvas, data);
  },

  renderSTL(canvasId: string, data: any) {
    const canvas = getCanvas(canvasId);
    if (!canvas) return;
    drawSTLDecompositionChart(canvas, data);
  },

  renderIllness(canvasId: string, data: any[], metric: any) {
    const canvas = getCanvas(canvasId);
    if (!canvas) return;
    drawIllnessCorrelationChart(canvas, data, metric);
  }
};
