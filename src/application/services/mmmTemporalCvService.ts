import type { TemporalDatasetResult } from './temporalModelDatasetService';
import { ols } from '../../utils/math';

export interface TemporalCvFold { trainEnd: string; testPeriod: string; trainRows: number; testRows: number; rmse: number; mae: number; coefficients: number[]; residualMean: number; residualStd: number; }
export interface TemporalCvReport { folds: TemporalCvFold[]; coefficientRanges: number[]; valid: boolean; warnings: string[]; limitations: string[]; }

/** Expanding-window OLS CV. Every fold fits coefficients on prior train periods only. */
export function runMmmTemporalCv(data: TemporalDatasetResult, minTrainPeriods = 6): TemporalCvReport {
  if (!Number.isInteger(minTrainPeriods) || minTrainPeriods < 2) throw new Error('minTrainPeriods должен быть >= 2.');
  const periods = [...new Set([...data.train, ...data.test].map(r => r.period))].sort();
  const rows = [...data.train, ...data.test]; const folds: TemporalCvFold[] = [];
  for (let i = minTrainPeriods; i < periods.length; i++) {
    const train = rows.filter(r => r.period < periods[i]); const test = rows.filter(r => r.period === periods[i]);
    if (!test.length || train.length < minTrainPeriods) continue;
    const fit = ols(train.map(r => [1, ...r.x]), train.map(r => Math.log(Math.max(1, r.actualRevenueRub))));
    const residuals = test.map(r => { const pred = fit.beta.reduce((s,b,j) => s + b * [1, ...r.x][j], 0); return Math.log(Math.max(1,r.actualRevenueRub)) - pred; });
    const rmse = Math.sqrt(residuals.reduce((s,e) => s + e*e,0) / residuals.length); const mae = residuals.reduce((s,e)=>s+Math.abs(e),0)/residuals.length; const mean = residuals.reduce((s,e)=>s+e,0)/residuals.length;
    folds.push({trainEnd: periods[i-1], testPeriod: periods[i], trainRows: train.length, testRows: test.length, rmse, mae, coefficients: fit.beta, residualMean: mean, residualStd: Math.sqrt(residuals.reduce((s,e)=>s+(e-mean)**2,0)/residuals.length)});
  }
  const coefficientRanges = data.featureNames.map((_,j)=>{const vals=folds.map(f=>f.coefficients[j+1]).filter(Number.isFinite);return vals.length?Math.max(...vals)-Math.min(...vals):NaN;});
  const warnings:string[]=[]; if(!folds.length) warnings.push('Недостаточно периодов для temporal CV.'); if(folds.some(f=>Math.abs(f.residualMean)>1)) warnings.push('Систематический residual bias на OOS fold.');
  data.featureNames.forEach((name,j)=>{const vals=folds.map(f=>f.coefficients[j+1]).filter(Number.isFinite); if(vals.some(v=>v>0)&&vals.some(v=>v<0)) warnings.push(`Sign flip коэффициента ${name}: знак меняется между folds.`); if(vals.length&&Math.abs(Math.max(...vals)-Math.min(...vals))>Math.max(1,Math.abs(vals.reduce((a,b)=>a+b,0)/vals.length)*3)) warnings.push(`Экстремальный drift коэффициента ${name}; идентифицируемость слабая.`);});
  return {folds,coefficientRanges,valid:folds.length>0&&!warnings.some(w=>w.includes('Недостаточно')),warnings,limitations:['OOS метрики рассчитаны на log-sales и не доказывают причинность.','Коэффициенты отражают ассоциации; temporal CV не устраняет confounding и endogeneity.']};
}
