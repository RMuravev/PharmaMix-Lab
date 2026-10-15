import { openPharmaDatabase } from './database';
import { transactionDone } from './transaction';
import type { ActiveCausalIdentity } from '../../application/services/causalStudySessionService';
/** Metadata-only verification: polling must not rescan five fact stores. */
export async function readActiveCausalIdentity(projectId:string):Promise<ActiveCausalIdentity> {
 const db=await openPharmaDatabase();
 const tx=db.transaction('projects','readonly'),done=transactionDone(tx);
 const request=tx.objectStore('projects').get(projectId);
 let version:string|null=null;
 request.onsuccess=()=>{version=(request.result as {activeDatasetVersion?:string}|undefined)?.activeDatasetVersion??null;};
 await done; return {projectId,datasetVersion:version};
}
export interface CurrentAnalysisWriteGuard {isCurrent:()=>boolean}
/** Called inside the same readwrite transaction as the result write. The project
 * pointer cannot be published between this check and the write's commit.
 */
export function putCurrentAnalysis(tx:IDBTransaction,store:string,record:{projectId:string;datasetVersion:string},guard:CurrentAnalysisWriteGuard):void {
 const request=tx.objectStore('projects').get(record.projectId);
 request.onsuccess=()=>{
  const version=(request.result as {activeDatasetVersion?:string}|undefined)?.activeDatasetVersion;
  if(!guard.isCurrent()||version!==record.datasetVersion){tx.abort();return;}
  tx.objectStore(store).put(record);
 };
}
