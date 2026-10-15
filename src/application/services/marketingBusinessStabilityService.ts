/** Descriptive stability of modeled incremental revenue across independently fitted windows.
 * The counterfactual must be computed with the SAME fitted model and non-target
 * drivers unchanged. This is an association-based scenario, not causal lift.
 */
export interface DriverBusinessEstimate {
  driver: string;
  incrementalRevenueRub: number;
  /** Actual attributable investment in RUB; never infer from TRP or visit counts. */
  investmentRub?: number | null;
}
export interface BusinessWindowEstimate {
  windowId: string;
  trainEnd: string;
  drivers: DriverBusinessEstimate[];
}
export interface BusinessDriverStability {
  driver: string;
  windows: number;
  incrementalRevenueRub: number[];
  minIncrementalRevenueRub: number;
  maxIncrementalRevenueRub: number;
  signConsistent: boolean;
  relativeRange: number | null;
  roiByWindow: (number | null)[];
  warnings: string[];
}
export interface BusinessStabilityReport { drivers: BusinessDriverStability[]; warnings: string[]; }
export function assessMarketingBusinessStability(windows: BusinessWindowEstimate[]): BusinessStabilityReport {
  if (!Array.isArray(windows) || windows.length < 2) throw new Error('Для анализа устойчивости нужны минимум два окна.');
  const ids = new Set<string>();
  for (const w of windows) {
    if (!w.windowId || ids.has(w.windowId)) throw new Error('Идентификаторы окон должны быть уникальными.');
    ids.add(w.windowId);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(w.trainEnd)) throw new Error('Некорректная дата окончания обучения.');
    const drivers = new Set<string>();
    for (const d of w.drivers) {
      if (!d.driver || drivers.has(d.driver) || !Number.isFinite(d.incrementalRevenueRub)) throw new Error('Некорректные или повторяющиеся оценки драйвера.');
      if (d.investmentRub != null && (!Number.isFinite(d.investmentRub) || d.investmentRub < 0)) throw new Error('Инвестиции должны быть неотрицательными и конечными.');
      drivers.add(d.driver);
    }
  }
  const names = [...new Set(windows.flatMap(w => w.drivers.map(d => d.driver)))].sort();
  const warnings: string[] = ['Инкрементальная выручка является модельной оценкой сценария, а не доказанным причинным эффектом.', 'ROI вычисляется как (инкрементальная выручка − инвестиции) / инвестиции; при неизвестных или нулевых инвестициях он не определён.'];
  const drivers = names.map(driver => {
    const rows = windows.map(w => w.drivers.find(d => d.driver === driver));
    const messages: string[] = [];
    if (rows.some(r => !r)) messages.push('Драйвер отсутствует в одном или нескольких окнах; сравнение неполное.');
    const available = rows.filter((r): r is DriverBusinessEstimate => r !== undefined);
    const values = available.map(r => r.incrementalRevenueRub);
    const min = Math.min(...values), max = Math.max(...values);
    const signConsistent = values.length === windows.length && (values.every(v => v > 0) || values.every(v => v < 0) || values.every(v => v === 0));
    const meanMagnitude = values.reduce((s,v) => s + Math.abs(v), 0) / values.length;
    const relativeRange = meanMagnitude > 0 ? (max-min)/meanMagnitude : null;
    if (!signConsistent) messages.push('Знак эффекта меняется или отсутствуют окна.');
    if (relativeRange !== null && relativeRange > 1) messages.push('Размах эффекта превышает средний абсолютный эффект (эвристика).');
    const roiByWindow = rows.map(r => r && r.investmentRub != null && r.investmentRub > 0 ? (r.incrementalRevenueRub-r.investmentRub)/r.investmentRub : null);
    if (roiByWindow.some(r => r === null)) messages.push('ROI недоступен для окон без подтверждённых положительных инвестиций.');
    return {driver,windows:available.length,incrementalRevenueRub:values,minIncrementalRevenueRub:min,maxIncrementalRevenueRub:max,signConsistent,relativeRange,roiByWindow,warnings:messages};
  });
  return {drivers,warnings};
}
