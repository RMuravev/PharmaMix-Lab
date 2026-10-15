import { putCurrentAnalysis, type CurrentAnalysisWriteGuard } from './activeCausalIdentityRepository';
import { openPharmaDatabase } from './database';
import type { JointEventStudyReport } from '../../application/services/staggeredEventStudyDiagnosticsService';
import type { CalibrationGate } from '../../application/services/eventStudyCalibrationGateService';

export interface PersistedEventStudyDiagnostics {
  id: string;
  projectId: string;
  datasetVersion: string;
  createdAt: string;
  algorithmVersion: string;
  brand: string;
  grain: string;
  driver: 'promoActive' | 'weightedVisits';
  outcome: 'salesRub' | 'salesUnits';
  preMonths: number;
  postMonths: number;
  eligibleUnits: string[];
  calendar: string[];
  report: JointEventStudyReport;
  gate: CalibrationGate;
}

export function validateEventStudyDiagnostics(r: PersistedEventStudyDiagnostics): void {
  if (!r.id || !r.projectId || !r.datasetVersion || !r.algorithmVersion || !r.brand.trim() ||
      !r.grain || !Number.isFinite(Date.parse(r.createdAt)) ||
      !['promoActive', 'weightedVisits'].includes(r.driver) ||
      !['salesRub', 'salesUnits'].includes(r.outcome) ||
      !Number.isInteger(r.preMonths) || r.preMonths < 2 ||
      !Number.isInteger(r.postMonths) || r.postMonths < 0 ||
      !Array.isArray(r.eligibleUnits) || !r.eligibleUnits.length ||
      new Set(r.eligibleUnits).size !== r.eligibleUnits.length ||
      !Array.isArray(r.calendar) || !r.calendar.length ||
      !r.calendar.every((period, index) => index === 0 || r.calendar[index - 1] < period) ||
      new Set(r.calendar).size !== r.calendar.length ||
      !r.calendar.every(p => /^\d{4}-(0[1-9]|1[0-2])$/.test(p)) ||
      !r.eligibleUnits.every(unit => typeof unit === 'string' && unit.trim().length > 0) ||
      !r.report || !Array.isArray(r.report.points) || !r.gate ||
      r.gate.eligibleForAutomaticCalibration !== false)
    throw new Error('Некорректная запись диагностики Event Study.');
}

export async function saveEventStudyDiagnostics(r: PersistedEventStudyDiagnostics, guard?: CurrentAnalysisWriteGuard): Promise<void> {
  validateEventStudyDiagnostics(r);
  const db = await openPharmaDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(guard ? ['projects','eventStudyDiagnostics'] : ['eventStudyDiagnostics'], 'readwrite');
    if(guard) putCurrentAnalysis(tx,'eventStudyDiagnostics',r,guard); else tx.objectStore('eventStudyDiagnostics').put(r);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Ошибка сохранения диагностики.'));
    tx.onabort = () => reject(tx.error ?? new Error('Сохранение диагностики прервано.'));
  });
}

export async function listEventStudyDiagnostics(projectId: string): Promise<PersistedEventStudyDiagnostics[]> {
  const db = await openPharmaDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('eventStudyDiagnostics', 'readonly');
    const req = tx.objectStore('eventStudyDiagnostics').index('projectId').getAll(projectId);
    let rows: PersistedEventStudyDiagnostics[] = [];
    req.onsuccess = () => { rows = req.result as PersistedEventStudyDiagnostics[]; };
    tx.oncomplete = () => resolve(rows.sort((a,b) => b.createdAt.localeCompare(a.createdAt)));
    tx.onerror = () => reject(tx.error ?? new Error('Ошибка чтения диагностики.'));
    tx.onabort = () => reject(tx.error ?? new Error('Чтение диагностики прервано.'));
  });
}

/** Only diagnostics for the currently published dataset version may be used for comparisons. */
export async function listCurrentEventStudyDiagnostics(projectId: string, datasetVersion: string): Promise<PersistedEventStudyDiagnostics[]> {
  if (!projectId.trim() || !datasetVersion.trim()) throw new Error('Не задан проект или версия данных.');
  const db = await openPharmaDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('eventStudyDiagnostics', 'readonly');
    const req = tx.objectStore('eventStudyDiagnostics')
      .index('projectId_datasetVersion').getAll([projectId, datasetVersion]);
    let rows: PersistedEventStudyDiagnostics[] = [];
    req.onsuccess = () => { rows = req.result as PersistedEventStudyDiagnostics[]; };
    tx.oncomplete = () => resolve(rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    tx.onerror = () => reject(tx.error ?? new Error('Ошибка чтения диагностики актуальной версии.'));
    tx.onabort = () => reject(tx.error ?? new Error('Чтение диагностики прервано.'));
  });
}
