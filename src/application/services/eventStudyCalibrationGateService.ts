import type { JointEventStudyReport } from './staggeredEventStudyDiagnosticsService';

export interface CalibrationGate {
  methodologicalStatus: 'review' | 'blocked';
  statisticalStatus: 'detected' | 'not-detected' | 'unavailable';
  eligibleForAutomaticCalibration: false;
  reasons: string[];
}
/** Diagnostic triage only: event-study checks alone cannot establish causal identification. */
export function assessEventStudyForCalibration(report: JointEventStudyReport): CalibrationGate {
  const reasons: string[] = [];
  if (report.pretrendStatus === 'rejected') reasons.push('Совместная диагностика отвергает отсутствие предтрендов.');
  if (report.pretrendStatus === 'not-testable') reasons.push('Недостаточно данных для совместной проверки предтрендов.');
  if (report.missingEventTimes.some(t => t < -1)) reasons.push('Отсутствуют необходимые placebo-периоды.');
  const post = report.points.filter(p => p.eventMonth >= 0);
  if (!post.length) reasons.push('Нет оценок после начала воздействия.');
  if (post.some(p => p.controlUnitsMin < 5 || p.treatedUnits < 5)) reasons.push('Недостаточно единиц воздействия или контроля для части периодов.');
  const completePost = post.filter(p => p.ciLow !== null && p.ciHigh !== null);
  const statisticalStatus = !completePost.length ? 'unavailable' : completePost.some(p => p.ciLow! > 0 || p.ciHigh! < 0) ? 'detected' : 'not-detected';
  reasons.push('Автоматическая калибровка заблокирована: дополнительно требуются проверки интерференции, сопоставимости воздействия и устойчивости контроля.');
  return { methodologicalStatus: reasons.length > 1 ? 'blocked' : 'review', statisticalStatus, eligibleForAutomaticCalibration: false, reasons };
}
