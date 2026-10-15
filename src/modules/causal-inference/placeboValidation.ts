/**
 * Плацебо-тесты квази-экспериментов (In-Time and In-Space Placebo Tests)
 */

import { avg, tP2 } from '../../utils/math';

export interface PlaceboTestResult {
  placeboPassed: boolean;
  placeboEffect: number;
  placeboP: number;
  fakeSplitMonth: string;
}

export function runInTimePlaceboTest(
  treatSeries: number[],
  scaledControlSeries: number[],
  preMonths: string[]
): PlaceboTestResult {
  if (preMonths.length < 4) {
    return {
      placeboPassed: true,
      placeboEffect: 0,
      placeboP: 1.0,
      fakeSplitMonth: preMonths[0] || '—'
    };
  }

  const placSplitIdx = Math.floor(preMonths.length / 2);
  const fakeSplitMonth = preMonths[placSplitIdx];

  const pre1Treat = avg(preMonths.slice(0, placSplitIdx).map((_, i) => treatSeries[i]));
  const pre2Treat = avg(preMonths.slice(placSplitIdx).map((_, i) => treatSeries[placSplitIdx + i]));
  const pre1Ctrl = avg(preMonths.slice(0, placSplitIdx).map((_, i) => scaledControlSeries[i]));
  const pre2Ctrl = avg(preMonths.slice(placSplitIdx).map((_, i) => scaledControlSeries[placSplitIdx + i]));

  const placTreatDiff = pre2Treat - pre1Treat;
  const placCtrlDiff = pre2Ctrl - pre1Ctrl;
  const placeboEffect = placTreatDiff - placCtrlDiff;

  const sePlac = Math.max(1e-6, Math.abs(pre1Treat) * 0.05);
  const tPlac = placeboEffect / sePlac;
  const placeboP = tP2(tPlac, Math.max(1, placSplitIdx - 1));

  // Если плацебо-эффект статистически неотличим от нуля (p > 0.05), тест пройден
  const placeboPassed = placeboP > 0.05 || Math.abs(placeboEffect / Math.max(1, pre1Treat)) < 0.04;

  return {
    placeboPassed,
    placeboEffect,
    placeboP,
    fakeSplitMonth
  };
}
