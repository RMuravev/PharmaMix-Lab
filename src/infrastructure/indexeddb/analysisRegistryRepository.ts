import { putCurrentAnalysis, type CurrentAnalysisWriteGuard } from './activeCausalIdentityRepository';
import { openPharmaDatabase } from './database';
import type { ComparableEffect } from '../../application/services/causalMmmReconciliationService';

export type AnalysisKind = 'mmm' | 'causal';
export interface AnalysisRegistryRecord {
  id: string;
  projectId: string;
  datasetVersion: string;
  kind: AnalysisKind;
  createdAt: string;
  algorithmVersion: string;
  definition: string;
  effect: ComparableEffect;
}
function validate(r: AnalysisRegistryRecord) {
  if (!r.id || !r.projectId || !r.datasetVersion || !r.algorithmVersion || !r.definition ||
    !Number.isFinite(r.effect.incrementalTotal) || r.effect.source !== r.kind ||
    !Number.isSafeInteger(r.effect.unitMonths) || r.effect.unitMonths <= 0 ||
    !Number.isFinite(Date.parse(r.createdAt))) throw new Error('Некорректная запись реестра анализа.');
}
export async function saveAnalysisResult(record: AnalysisRegistryRecord, guard?: CurrentAnalysisWriteGuard): Promise<void> {
  validate(record);
  const db = await openPharmaDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(guard ? ['projects','analysisRegistry'] : ['analysisRegistry'], 'readwrite');
    if(guard) putCurrentAnalysis(tx,'analysisRegistry',record,guard); else tx.objectStore('analysisRegistry').put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Не удалось сохранить анализ.'));
    tx.onabort = () => reject(tx.error ?? new Error('Транзакция сохранения прервана.'));
  });
}
export async function listAnalysisResults(projectId: string): Promise<AnalysisRegistryRecord[]> {
  const db = await openPharmaDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('analysisRegistry', 'readonly');
    const req = tx.objectStore('analysisRegistry').index('projectId').getAll(projectId);
    req.onsuccess = () => resolve((req.result as AnalysisRegistryRecord[]).sort((a,b) => b.createdAt.localeCompare(a.createdAt)));
    req.onerror = () => reject(req.error ?? new Error('Не удалось прочитать реестр анализа.'));
  });
}
export function compatibleRegistryPair(a: AnalysisRegistryRecord, b: AnalysisRegistryRecord): boolean {
  return a.projectId === b.projectId && a.datasetVersion === b.datasetVersion && a.kind !== b.kind &&
    a.definition === b.definition && a.effect.driver === b.effect.driver &&
    a.effect.outcome === b.effect.outcome && a.effect.periodStart === b.effect.periodStart &&
    a.effect.periodEnd === b.effect.periodEnd && a.effect.populationKey === b.effect.populationKey &&
    a.effect.unitMonths === b.effect.unitMonths;
}
