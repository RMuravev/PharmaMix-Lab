import type { TemporalDatasetResult } from './temporalModelDatasetService';
import { ols } from '../../utils/math';

export interface TemporalCvFold { trainEnd: string; testPeriod: string; trainRows: number; testRows: number; rmse: number; mae: number; coefficients: number[]; contributions: number[]; residualMean: number; residualStd: number; }
export interface TemporalCvFeatureSummary { featureName: string; coefficientRange: number; minCoefficient: number; maxCoefficient: number; contributionRange: number; contributionMean: number; signFlip: boolean; extremeDrift: boolean; }
export interface TemporalCvDecisionSummary { foldCount: number; meanRmse: number | null; meanMae: number | null; meanResidualAbs: number | null; residualLag1: number | null; featureSummaries: TemporalCvFeatureSummary[]; warningCount: number; decision: 'ready' | 'caution' | 'insufficient'; }
export interface TemporalCvReport { folds: TemporalCvFold[]; coefficientRanges: number[]; featureSummaries: TemporalCvFeatureSummary[]; summary: TemporalCvDecisionSummary; valid: boolean; warnings: string[]; limitations: string[]; }
export function normalizedResidualLag1(values: number[], periods: string[]): number | null {
  const pairs: number[][] = []; for (let i=1;i<values.length;i++){if(!Number.isFinite(values[i])||!Number.isFinite(values[i-1])) continue; const d=new Date(`${periods[i-1]}-01`); d.setUTCMonth(d.getUTCMonth()+1); if(d.toISOString().slice(0,7)===periods[i]) pairs.push([values[i-1],values[i]]);}
  if(pairs.length<2) return null; const a=pairs.map(x=>x[0]),b=pairs.map(x=>x[1]); const am=a.reduce((s,v)=>s+v,0)/a.length,bm=b.reduce((s,v)=>s+v,0)/b.length; const da=Math.sqrt(a.reduce((s,v)=>s+(v-am)**2,0)),db=Math.sqrt(b.reduce((s,v)=>s+(v-bm)**2,0)); return da>0&&db>0?a.reduce((s,v,i)=>s+(v-am)*(b[i]-bm),0)/(da*db):null;
}

/** Expanding-window OLS CV. Every fold fits coefficients on prior train periods only. */
export function runMmmTemporalCv(data: TemporalDatasetResult, minTrainPeriods = 6): TemporalCvReport {
  if (!Number.isInteger(minTrainPeriods) || minTrainPeriods < 2) throw new Error('minTrainPeriods должен быть >= 2.');
  const allRows = [...data.train, ...data.test];
  const validPeriod = (period: unknown): period is string => typeof period === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(period);
  const malformed = allRows.some(r => !r || !validPeriod(r.period) || !Number.isFinite(r.actualRevenueRub) || !Array.isArray(r.x) || r.x.length !== data.featureNames.length || r.x.some(v => !Number.isFinite(v)));
  const baseLimitations=['OOS метрики рассчитаны на log-sales и не доказывают причинность.','Коэффициенты отражают ассоциации; temporal CV не устраняет confounding и endogeneity.','Порог drift = max(1, 3× абсолютное среднее коэффициента) является эвристикой, а не тестом идентифицируемости.'];
  if (malformed || !data.featureNames.length) { const warning = allRows.some(r => !r || !validPeriod(r?.period)) ? 'Некорректный период YYYY-MM: ожидается месяц 01…12; temporal CV остановлен fail-closed.' : 'Некорректные или неполные model rows/fold outputs: temporal CV остановлен fail-closed.'; const summary: TemporalCvDecisionSummary={foldCount:0,meanRmse:null,meanMae:null,meanResidualAbs:null,residualLag1:null,featureSummaries:[],warningCount:1,decision:'insufficient'}; return {folds:[],coefficientRanges:data.featureNames.map(()=>NaN),featureSummaries:[],summary,valid:false,warnings:[warning],limitations:baseLimitations}; }
  const periods = [...new Set(allRows.map(r => r.period))].sort();
  const rows = [...data.train, ...data.test]; const folds: TemporalCvFold[] = [];
  let outputInvalid = false;
  for (let i = minTrainPeriods; i < periods.length; i++) {
    const train = rows.filter(r => r.period < periods[i]); const test = rows.filter(r => r.period === periods[i]);
    if (!test.length || train.length < minTrainPeriods) continue;
    const fit = ols(train.map(r => [1, ...r.x]), train.map(r => Math.log(Math.max(1, r.actualRevenueRub))));
    if (fit.beta.length !== data.featureNames.length + 1 || fit.beta.some(v => !Number.isFinite(v))) { outputInvalid = true; break; }
    const residuals = test.map(r => { const pred = fit.beta.reduce((s,b,j) => s + b * [1, ...r.x][j], 0); return Math.log(Math.max(1,r.actualRevenueRub)) - pred; });
    if (residuals.some(v => !Number.isFinite(v))) { outputInvalid = true; break; }
    const rmse = Math.sqrt(residuals.reduce((s,e) => s + e*e,0) / residuals.length); const mae = residuals.reduce((s,e)=>s+Math.abs(e),0)/residuals.length; const mean = residuals.reduce((s,e)=>s+e,0)/residuals.length;
    const contributions = data.featureNames.map((_,j) => test.reduce((s,r)=>s + fit.beta[j+1]*r.x[j],0)/test.length);
    if (contributions.some(v => !Number.isFinite(v)) || ![rmse,mae,mean].every(Number.isFinite)) { outputInvalid = true; break; }
    folds.push({trainEnd: periods[i-1], testPeriod: periods[i], trainRows: train.length, testRows: test.length, rmse, mae, coefficients: fit.beta, contributions, residualMean: mean, residualStd: Math.sqrt(residuals.reduce((s,e)=>s+(e-mean)**2,0)/residuals.length)});
  }
  const coefficientRanges = data.featureNames.map((_,j)=>{const vals=folds.map(f=>f.coefficients[j+1]);return vals.length?Math.max(...vals)-Math.min(...vals):NaN;});
  const warnings:string[]=[]; if(outputInvalid) warnings.push('Невалидный fold output (NaN/Infinity/неполный результат): temporal CV остановлен fail-closed.'); if(!folds.length && !outputInvalid) warnings.push('Недостаточно периодов для temporal CV.'); if(folds.some(f=>Math.abs(f.residualMean)>1)) warnings.push('Систематический residual bias на OOS fold.');
  const featureSummaries = data.featureNames.map((name,j)=>{const vals=folds.map(f=>f.coefficients[j+1]).filter(Number.isFinite); const cs=folds.map(f=>f.contributions[j]).filter(Number.isFinite); const minCoefficient=vals.length?Math.min(...vals):NaN; const maxCoefficient=vals.length?Math.max(...vals):NaN; const coefficientRange=vals.length?maxCoefficient-minCoefficient:NaN; const contributionRange=cs.length?Math.max(...cs)-Math.min(...cs):NaN; const contributionMean=cs.length?cs.reduce((a,b)=>a+b,0)/cs.length:NaN; const signFlip=vals.some(v=>v>0)&&vals.some(v=>v<0); const extremeDrift=vals.length>0&&coefficientRange>Math.max(1,Math.abs(vals.reduce((a,b)=>a+b,0)/vals.length)*3); if(signFlip) warnings.push(`Sign flip коэффициента ${name}: знак меняется между folds.`); if(extremeDrift) warnings.push(`Экстремальный drift коэффициента ${name}; идентифицируемость слабая.`); return {featureName:name,coefficientRange,minCoefficient,maxCoefficient,contributionRange,contributionMean,signFlip,extremeDrift};});
  const mean = (xs:number[]) => xs.length ? xs.reduce((a,b)=>a+b,0)/xs.length : null;
  const meanRmse=mean(folds.map(f=>f.rmse)), meanMae=mean(folds.map(f=>f.mae)), meanResidualAbs=mean(folds.map(f=>Math.abs(f.residualMean))); const residualPairs=folds.slice(1).map((f,i)=>({a:folds[i],b:f})).filter(({a,b})=>{const d=new Date(`${a.testPeriod}-01`); d.setUTCMonth(d.getUTCMonth()+1); return d.toISOString().slice(0,7)===b.testPeriod;}); const av=residualPairs.map(p=>p.a.residualMean), bv=residualPairs.map(p=>p.b.residualMean); const am=mean(av), bm=mean(bv); const acf=residualPairs.length>1&&am!==null&&bm!==null?(() => {const num=residualPairs.reduce((s,_,i)=>s+(av[i]-am!)*(bv[i]-bm!),0); const da=Math.sqrt(av.reduce((s,v)=>s+(v-am!)**2,0)), db=Math.sqrt(bv.reduce((s,v)=>s+(v-bm!)**2,0)); return da>0&&db>0?num/(da*db):null;})():null; const residualLag1=acf; if(residualLag1!==null&&residualLag1>0.7) warnings.push('Структура residuals между последовательными месяцами: высокая lag-1 автокорреляция.');
  const summary: TemporalCvDecisionSummary = {foldCount:folds.length,meanRmse,meanMae,meanResidualAbs,residualLag1,featureSummaries,warningCount:warnings.length,decision:outputInvalid||!folds.length?'insufficient':warnings.length?'caution':'ready'};
  return {folds,coefficientRanges,featureSummaries,summary,valid:folds.length>0&&!outputInvalid&&!warnings.some(w=>w.includes('Недостаточно')),warnings,limitations:baseLimitations.concat('Contribution dispersion агрегирует средние fold-level driver contributions; это не attribution и не causal effect.','Residual lag-1 — центрированная нормированная корреляция только между соседними календарными месяцами; короткие/нулевые дисперсии дают unknown.')};
}
