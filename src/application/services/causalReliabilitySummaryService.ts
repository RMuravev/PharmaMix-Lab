import type { MatchedLiftResult } from './causalLiftPipelineService';
import type { JointEventStudyReport } from './staggeredEventStudyDiagnosticsService';

export interface CausalReliabilitySummary { status: 'ready'|'caution'|'insufficient'; coverage: { units: number; months: number; cells: number; observedCells?: number }; sampleDiagnostics: { eventStudyTreatedMax: number; eventStudyControlMin: number; matchedPairs: number }; warnings: string[]; assumptions: string[]; limitations: string[]; freshness?: { datasetVersion?: string; computedAt: string }; }

/** Pure, non-causal decision summary for the dashboard. It never upgrades an observational estimate into causal certainty. */
export function summarizeCausalReliability(input: { eligibleUnits: string[]; calendar: string[]; observedRows?: number; matched?: MatchedLiftResult|null; event?: JointEventStudyReport|null; datasetVersion?: string; computedAt?: string }): CausalReliabilitySummary {
  const units=input.eligibleUnits.length, months=input.calendar.length, cells=units*months;
  const warnings:string[]=[];
  const treated=input.matched?.pairs.length ?? input.event?.points.reduce((m,p)=>Math.max(m,p.treatedUnits),0) ?? 0;
  const controls=input.matched?.pairs.length ?? input.event?.points.reduce((m,p)=>Math.max(m,p.controlUnitsMin),0) ?? 0;
  if (units<2||months<3) warnings.push('Недостаточный declared panel coverage: нужны минимум 2 units и 3 месяца.');
  if (input.observedRows !== undefined && input.observedRows < cells) warnings.push('Панель дополнена нулевыми ячейками только внутри declared scope; полнота источника вне scope неизвестна.');
  if (input.event?.pretrendStatus==='rejected') warnings.push('Pre-trends/placebo leads сигнализируют нарушение устойчивости до воздействия.');
  if (input.event?.pretrendStatus==='not-testable') warnings.push('Pre-trends не тестируемы: недостаточно lead-периодов или bootstrap repetitions.');
  if (input.event?.missingEventTimes.length) warnings.push(`Отсутствуют event-time периоды: ${input.event.missingEventTimes.join(', ')}.`);
  if (input.matched && input.matched.pairs.length<5) warnings.push('Мало matched pairs: effective sample и uncertainty ограничены.');
  warnings.push('Оценка наблюдательная; non-rejected pre-trends не доказывают parallel trends, а bootstrap не устраняет spillover/confounding.');
  if(input.event) warnings.push('Event Study counts являются descriptive per-event-time bounds, не единым effective sample size.');
  return {status: units<2||months<3?'insufficient':warnings.length>1?'caution':'ready',coverage:{units,months,cells,observedCells:input.observedRows},sampleDiagnostics:{eventStudyTreatedMax:treated,eventStudyControlMin:controls,matchedPairs:input.matched?.pairs.length??0},warnings,assumptions:['Treatment timing определяется первым положительным exposure.','Controls должны оставаться untreated до соответствующего event-time.','Нули действуют только внутри явно объявленного unit × calendar scope.'],limitations:['Causal validity не следует из predictive stability или CI.','Spatial spillovers, treatment contamination и selection в matching требуют предметной проверки.'],freshness: input.datasetVersion||input.computedAt ? {datasetVersion:input.datasetVersion,computedAt:input.computedAt??new Date().toISOString()} : undefined};
}
