import type { AlignedPanel } from './panelSourceAlignmentService';
import { buildPanelDesignMatrix } from './panelDesignMatrixService';
import { prepareTemporalModelDataset } from './temporalModelDatasetService';
import { trainTemporalMmm } from './temporalMmmTrainingService';
import { hillSaturation, type HillSetting } from './marketingSaturationService';
import { applyMarketingCarryover, type CarryoverSettings, type Driver } from './marketingCarryoverOptimizationService';

const drivers: Driver[] = ['tvTrp','weightedVisits','bonusEstimateRub'];
export type HillSettings = Record<Driver,HillSetting>;
export interface HillCvResult { settings: HillSettings; cvWapePct: number; evaluations: number; }
/** Apply Hill after lag/adstock, preserving the three distinct source grains. */
export function applyMarketingHill(panels: AlignedPanel[], settings: HillSettings): AlignedPanel[] {
  return panels.map(p => ({...p,
    tvTrp: p.tvTrp === null ? null : hillSaturation(p.tvTrp,settings.tvTrp),
    weightedVisits: p.weightedVisits === null ? null : hillSaturation(p.weightedVisits,settings.weightedVisits),
    bonusEstimateRub: hillSaturation(p.bonusEstimateRub,settings.bonusEstimateRub)
  }));
}
/** Sequential coordinate search on TRAIN ONLY. This is not a global joint optimum.
 * Every candidate uses identical calendar folds; a candidate with missing rows fails.
 */
export function optimizeMarketingHill(panels: AlignedPanel[], options: {
  carryover: CarryoverSettings; testStart: string; testEnd: string; lambda: number;
  halfSaturationFractions?: number[]; slopes?: number[]; folds?: number; validationMonths?: number; passes?: number; onProgress?: (completed: number, total: number) => void;
}): HillCvResult {
  const fractions = options.halfSaturationFractions ?? [0.25,0.5,1,2];
  const slopes = options.slopes ?? [1,2];
  const folds = options.folds ?? 3, window = options.validationMonths ?? 2, passes = options.passes ?? 1;
  if (!fractions.length || !slopes.length || fractions.some(x=>!Number.isFinite(x)||x<=0) || slopes.some(x=>!Number.isFinite(x)||x<=0) || ![folds,window,passes].every(x=>Number.isInteger(x)&&x>0&&x<=12) || !Number.isFinite(options.lambda) || options.lambda<0) throw new Error('Некорректная сетка Hill CV.');
  const carried = applyMarketingCarryover(panels,options.carryover);
  const train = carried.filter(p=>p.period<options.testStart);
  const positive = (d: Driver) => train.map(p=>p[d]).filter((v):v is number=>v!==null&&v>0).sort((a,b)=>a-b);
  const bases = {} as Record<Driver,number>;
  for (const d of drivers) { const values = positive(d); if (!values.length) throw new Error(`Нет положительной истории для ${d}.`); bases[d]=values[Math.floor(values.length/2)]; }
  const settings = {} as HillSettings;
  for (const d of drivers) settings[d]={halfSaturation:bases[d],slope:1};
  const months = [...new Set(train.map(p=>p.period))].sort();
  if (months.length < folds*window+3) throw new Error('Недостаточно истории для Hill CV.');
  const foldsSpec = Array.from({length:folds},(_,i)=>{
    const start=months.length-(folds-i)*window;
    return {fit:new Set(months.slice(0,start)),validation:new Set(months.slice(start,start+window))};
  });
  const reference = buildPanelDesignMatrix(applyMarketingHill(carried,settings));
  if (reference.errors.length) throw new Error(reference.errors.join(' | '));
  const referenceDataset = prepareTemporalModelDataset(reference.rows,{testStart:options.testStart,testEnd:options.testEnd,standardize:false});
  if (referenceDataset.errors.length) throw new Error(referenceDataset.errors.join(' | '));
  const expected = referenceDataset.train.map(r=>JSON.stringify([r.period,r.panelKey])).sort().join('|');
  let evaluations=0;
  const totalEvaluations = 1 + passes * drivers.length * fractions.length * slopes.length;
  function score(candidate: HillSettings): number {
    evaluations++;
    options.onProgress?.(evaluations,totalEvaluations);
    try {
      const matrix=buildPanelDesignMatrix(applyMarketingHill(carried,candidate));
      if (matrix.errors.length) return Infinity;
      const dataset=prepareTemporalModelDataset(matrix.rows,{testStart:options.testStart,testEnd:options.testEnd,standardize:false});
      if (dataset.errors.length || dataset.train.map(r=>JSON.stringify([r.period,r.panelKey])).sort().join('|')!==expected) return Infinity;
      let error=0, actual=0;
      for (const fold of foldsSpec) {
        const fit=dataset.train.filter(r=>fold.fit.has(r.period));
        const val=dataset.train.filter(r=>fold.validation.has(r.period));
        if (!fit.length || !val.length) return Infinity;
        const means=dataset.featureNames.map((_,j)=>fit.reduce((s,r)=>s+r.x[j],0)/fit.length);
        const stds=means.map((m,j)=>Math.sqrt(fit.reduce((s,r)=>s+(r.x[j]-m)**2,0)/fit.length)||1);
        const scale=(rows:typeof fit)=>rows.map(r=>({...r,x:r.x.map((v,j)=>(v-means[j])/stds[j])}));
        const trained=trainTemporalMmm({...dataset,train:scale(fit),test:scale(val),errors:[],warnings:[]},{model:'ridge',lambda:options.lambda});
        for (const prediction of trained.testPredictions) {error+=Math.abs(prediction.actualRevenueRub-prediction.predictedRevenueRub);actual+=Math.abs(prediction.actualRevenueRub);}
      }
      return actual>0?100*error/actual:Infinity;
    } catch {return Infinity;}
  }
  let best=score(settings);
  for (let pass=0;pass<passes;pass++) for (const d of drivers) {
    for (const fraction of fractions) for (const slope of slopes) {
      const next={...settings,[d]:{halfSaturation:bases[d]*fraction,slope}};
      const value=score(next);
      if (value<best) {best=value;settings[d]=next[d];}
    }
  }
  if (!Number.isFinite(best)) throw new Error('Не удалось оценить Hill на общей временной CV.');
  return {settings,cvWapePct:best,evaluations};
}
