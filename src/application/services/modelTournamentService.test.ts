import { describe, expect, it } from 'vitest';
import { buildTournamentFolds, calculateTournamentMetrics, compareTournamentLosses, recommendTournament, runModelTournament, type TournamentCandidateResult } from './modelTournamentService';
import { MODEL_TOURNAMENT_CANDIDATES } from './modelTournamentCandidates';
import type { PreparedObservation, TemporalDatasetResult } from './temporalModelDatasetService';

const row = (period:string, y:number, x=[0]):PreparedObservation => ({period,panelKey:'p',actualRevenueRub:y,x});
const dataset = (rows:PreparedObservation[], features=['tvTrp']):TemporalDatasetResult => ({train:rows,test:[],featureNames:features as TemporalDatasetResult['featureNames'],trainMean:[],trainStd:[],errors:[],warnings:[]});

describe('Model Tournament v2',()=>{
  it('constructs deterministic expanding folds across a year boundary without filling calendar gaps',()=>{
    const folds=buildTournamentFolds(['2025-10','2025-11','2026-01','2026-02'],2,1);
    expect(folds).toEqual([{trainPeriods:['2025-10','2025-11'],testPeriods:['2026-01']},{trainPeriods:['2025-10','2025-11','2026-01'],testPeriods:['2026-02']}]);
  });
  it('calculates known-answer metrics and baseline skill',()=>{
    const m=calculateTournamentMetrics([10,20],[12,18],[15,15]);
    expect(m.mae).toBe(2); expect(m.rmse).toBe(2); expect(m.nrmse).toBeCloseTo(2/15); expect(m.r2).toBe(.84); expect(m.baselineSkill).toBeCloseTo(.6);
  });
  it('registers only genuinely supported candidate families',()=>{
    expect(MODEL_TOURNAMENT_CANDIDATES.map(x=>x.id)).toEqual(['seasonal-naive','ols','ridge','lasso','elastic-net']);
    expect(MODEL_TOURNAMENT_CANDIDATES.every(x=>x.supported)).toBe(true);
  });
  it('returns no clear winner for practical ties and blocks a better invalid candidate',()=>{
    const base=(id:string,rmse:number,eligible=true):TournamentCandidateResult=>({candidateId:id,label:id,status:'succeeded',complexity:1,interpretability:'high',folds:Array.from({length:3},(_,i)=>({trainEnd:`2025-0${i+3}`,testStart:`2025-0${i+4}`,testEnd:`2025-0${i+4}`,rmse,mae:rmse,actual:[100],predicted:[100],baseline:[100],coefficients:[],lambda:0})),metrics:{observations:12,rmse,mae:rmse,nrmse:rmse/100,r2:.5,baselineSkill:1-rmse/20,foldRmseMean:rmse,foldRmseStd:0},validity:{eligible,hardFailures:eligible?[]:['non-finite'],warnings:[]},coefficients:[],coefficientStability:[],failure:null});
    expect(recommendTournament([base('a',10),base('b',10.1)],'seasonal-naive').decision).toBe('no-clear-winner');
    const valid=base('valid',10), seasonal=base('seasonal-naive',20);
    const decision=recommendTournament([seasonal,base('invalid',5,false),valid],'seasonal-naive',[{leaderId:'valid',challengerId:'seasonal-naive',observations:12,meanSquaredLossDelta:300,hacStandardError:10,ciLow:280.4,ciHigh:319.6,conclusive:true}]);
    expect(decision.championId).toBe('valid'); expect(decision.excludedCandidateIds).toContain('invalid');
  });
  it('uses a paired lag-1 HAC interval and withholds certainty below eight observations',()=>{
    const candidate=(id:string,predicted:number[]):TournamentCandidateResult=>({candidateId:id,label:id,status:'succeeded',complexity:1,interpretability:'high',folds:[{trainEnd:'2025-12',testStart:'2026-01',testEnd:'2026-08',rmse:1,mae:1,actual:Array(predicted.length).fill(10),predicted,baseline:Array(predicted.length).fill(10),coefficients:[],lambda:0}],metrics:null,validity:{eligible:true,hardFailures:[],warnings:[]},coefficients:[],coefficientStability:[],failure:null});
    const comparison=compareTournamentLosses(candidate('leader',Array(8).fill(10)),candidate('challenger',Array(8).fill(12)));
    expect(comparison.meanSquaredLossDelta).toBe(4); expect(comparison.hacStandardError).toBe(0); expect(comparison.conclusive).toBe(true);
    expect(compareTournamentLosses(candidate('leader',[10,10]),candidate('challenger',[12,12])).hacStandardError).toBeNull();
  });
  it('fails closed for insufficient and non-finite data',()=>{
    expect(runModelTournament(dataset([row('2026-01',10)]),{minTrainPeriods:3,testWindow:1,candidateIds:['seasonal-naive']} ).recommendation.decision).toBe('insufficient-evidence');
    expect(()=>runModelTournament(dataset([row('2025-01',10),row('2025-02',20),row('2025-03',NaN),row('2025-04',30)]),{minTrainPeriods:2,testWindow:1,candidateIds:['ols']})).toThrow(/finite/i);
  });
  it('is deterministic and keeps every test period strictly after its training window',()=>{
    const rows=Array.from({length:18},(_,i)=>row(`${2025+Math.floor(i/12)}-${String(i%12+1).padStart(2,'0')}`,100+5*i,[i]));
    const config={minTrainPeriods:8,testWindow:2,candidateIds:['seasonal-naive','ols','ridge','lasso','elastic-net'] as const,lambdas:[.01,.1,1]};
    const a=runModelTournament(dataset(rows),config),b=runModelTournament(dataset(rows),config);
    expect(a).toEqual(b); expect(a.candidates.flatMap(c=>c.folds).every(f=>f.trainEnd<f.testStart)).toBe(true);
  });
});
