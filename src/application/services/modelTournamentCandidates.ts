import { ols } from '../../domain/statistics/ols';

export type TournamentCandidateId='seasonal-naive'|'ols'|'ridge'|'lasso'|'elastic-net';
export interface CandidateAdapter {id:TournamentCandidateId;label:string;supported:true;complexity:number;interpretability:'high'|'medium';fit(x:number[][],y:number[],lambda:number):{coefficients:number[];predict:(x:number[])=>number};}

function linearFit(x:number[][],y:number[],lambda:number,l1Ratio:number){
  if(!x.length||x.length!==y.length||x.some(r=>r.length!==x[0].length||r.some(v=>!Number.isFinite(v)))||y.some(v=>!Number.isFinite(v))) throw new Error('Candidate received non-finite training data.');
  const p=x[0].length, means=Array.from({length:p},(_,j)=>x.reduce((s,r)=>s+r[j],0)/x.length), std=means.map((m,j)=>Math.sqrt(x.reduce((s,r)=>s+(r[j]-m)**2,0)/x.length)||1);
  const z=x.map(r=>r.map((v,j)=>(v-means[j])/std[j])), ym=y.reduce((a,b)=>a+b,0)/y.length, centered=y.map(v=>v-ym), beta=Array(p).fill(0);
  for(let iter=0;iter<1000;iter++){let delta=0;for(let j=0;j<p;j++){let rho=0,norm=0;for(let i=0;i<z.length;i++){const partial=centered[i]-z[i].reduce((s,v,k)=>s+(k===j?0:v*beta[k]),0);rho+=z[i][j]*partial;norm+=z[i][j]**2;}const threshold=lambda*l1Ratio;const next=Math.sign(rho)*Math.max(0,Math.abs(rho)-threshold)/(norm+lambda*(1-l1Ratio));delta=Math.max(delta,Math.abs(next-beta[j]));beta[j]=next;}if(delta<1e-10)break;}
  const coefficients=[ym-beta.reduce((s,b,j)=>s+b*means[j]/std[j],0),...beta.map((b,j)=>b/std[j])];
  return {coefficients,predict:(values:number[])=>coefficients[0]+values.reduce((s,v,j)=>s+v*coefficients[j+1],0)};
}
const adapter=(id:TournamentCandidateId,label:string,complexity:number,interpretability:'high'|'medium',l1Ratio:number):CandidateAdapter=>({id,label,supported:true,complexity,interpretability,fit:(x,y,lambda)=>{
  if(id==='ols'){const result=ols(x.map(r=>[1,...r]),y);if(result.beta.some(v=>!Number.isFinite(v)))throw new Error('OLS produced non-finite coefficients.');return{coefficients:result.beta,predict:(values)=>result.beta[0]+values.reduce((s,v,j)=>s+v*result.beta[j+1],0)};}
  return linearFit(x,y,lambda,l1Ratio);
}});
export const MODEL_TOURNAMENT_CANDIDATES:readonly CandidateAdapter[]=[
  {id:'seasonal-naive',label:'Seasonal naive',supported:true,complexity:0,interpretability:'high',fit:()=>{throw new Error('Seasonal naive uses history directly.');}},
  adapter('ols','OLS',1,'high',0),adapter('ridge','Ridge',2,'high',0),adapter('lasso','Lasso',2,'high',1),adapter('elastic-net','Elastic Net',3,'medium',.5),
];
