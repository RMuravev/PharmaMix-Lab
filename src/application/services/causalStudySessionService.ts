import type { CausalStudyGrain } from './activeSnapshotCausalStudyService';
export type CausalStudySource =
  | Readonly<{kind:'uploaded';projectId:string}>
  | Readonly<{kind:'active';projectId:string;datasetVersion:string;brand:string;grain:CausalStudyGrain}>;
export interface ActiveCausalIdentity {projectId:string;datasetVersion:string|null}
/** Revision tokens cover preparation, deferred calculation, verification, and saves.
 * Uploaded studies are sandbox estimates, never active-project provenance.
 */
export class CausalStudySession {
 private revision=0;
 private context='';
 setContext(context:string):void { if(this.context!==context){this.context=context;this.invalidate();} }
 capture():number{return this.revision;}
 invalidate():void{this.revision++;}
 isCurrent(ticket:number):boolean{return ticket===this.revision;}
 async verify(source:CausalStudySource,ticket:number,read:()=>Promise<ActiveCausalIdentity>):Promise<boolean>{
  if(!this.isCurrent(ticket))return false;
  if(source.kind==='uploaded')return true;
  try {const current=await read();return this.isCurrent(ticket)&&current.projectId===source.projectId&&current.datasetVersion===source.datasetVersion;}
  catch{return false;}
 }
}

/** At most one read in flight. A superseded context/read or stopped poller cannot
 * publish an old identity, including after component unmount. Errors revoke trust.
 */
export function startCausalIdentityPolling(session:CausalStudySession,read:()=>Promise<ActiveCausalIdentity>,publish:(identity:ActiveCausalIdentity|null)=>void):()=>void {
 let stopped=false;
 let timer:ReturnType<typeof setTimeout>|undefined;
 const verify=async()=>{
  const ticket=session.capture();
  let identity:ActiveCausalIdentity|null=null;
  try{identity=await read();}catch{/* Unverifiable, never reuse a prior success. */}
  if(stopped)return;
  if(session.isCurrent(ticket))publish(identity);
  timer=setTimeout(()=>void verify(),1000);
 };
 void verify();
 return ()=>{stopped=true;if(timer!==undefined)clearTimeout(timer);};
}
