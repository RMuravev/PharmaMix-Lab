/**
 * Тест параллельности предтрендов (Parallel Trends Pre-Test)
 */

import { avg, corr } from '../../utils/math';

export interface PreTrendTestResult {
  parallelTrendsValid: boolean;
  deltaSlopePct: number;
  r2Pre: number;
  slopeTreat: number;
  slopeCtrl: number;
}

export function testPreTrendParallelism(
  treatSeries: number[],
  scaledControlSeries: number[],
  preMonths: string[]
): PreTrendTestResult {
  const nPre = preMonths.length;
  if (nPre < 2) {
    return {
      parallelTrendsValid: true,
      deltaSlopePct: 0,
      r2Pre: 1,
      slopeTreat: 0,
      slopeCtrl: 0
    };
  }

  const tPreIdx = Array.from({ length: nPre }, (_, i) => i);
  const tPreMean = avg(tPreIdx);
  let sxx = 0, sxyTreat = 0, sxyCtrl = 0;

  for (let i = 0; i < nPre; i++) {
    const dt = tPreIdx[i] - tPreMean;
    sxx += dt * dt;
    sxyTreat += dt * treatSeries[i];
    sxyCtrl += dt * scaledControlSeries[i];
  }

  const slopeTreat = sxx > 0 ? sxyTreat / sxx : 0;
  const slopeCtrl = sxx > 0 ? sxyCtrl / sxx : 0;
  const deltaSlope = slopeTreat - slopeCtrl;
  const treatPreAvg = avg(preMonths.map((_, i) => treatSeries[i])) || 1;
  const deltaSlopePct = (deltaSlope / Math.max(1, treatPreAvg)) * 100;
  const parallelTrendsValid = Math.abs(deltaSlopePct) < 2.5;

  const treatPreVals = preMonths.map((_, i) => treatSeries[i]);
  const ctrlPreVals = preMonths.map((_, i) => scaledControlSeries[i]);
  const rPre = corr(treatPreVals, ctrlPreVals);
  const r2Pre = Math.max(0, rPre * rPre);

  return {
    parallelTrendsValid,
    deltaSlopePct,
    r2Pre,
    slopeTreat,
    slopeCtrl
  };
}
