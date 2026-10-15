import { describe, expect, it } from 'vitest';
import { CausalStudySession, type CausalStudySource } from './causalStudySessionService';
const source: CausalStudySource = {kind:'active',projectId:'p',datasetVersion:'v1',brand:'A',grain:'promo-chain-brand'};
const deferred = <T>() => { let resolve!: (value:T)=>void; const promise=new Promise<T>(r=>{resolve=r;}); return {promise,resolve}; };
describe('causal study production lifecycle',()=>{
 it('revokes old operations after selection, parameter or project changes',()=>{
  const session=new CausalStudySession(); session.setContext('p/A/promo/start'); const ticket=session.capture();
  session.setContext('p/B/promo/start'); expect(session.isCurrent(ticket)).toBe(false);
 });
 it('rejects stale verification and read failures, but allows unverifiable uploads without reading active data',async()=>{
  const session=new CausalStudySession(); const ticket=session.capture();
  expect(await session.verify(source,ticket,async()=>({projectId:'p',datasetVersion:'v2'}))).toBe(false);
  expect(await session.verify(source,ticket,async()=>{throw new Error('read failed');})).toBe(false);
  expect(await session.verify({kind:'uploaded',projectId:'p'},ticket,async()=>{throw new Error('must not read');})).toBe(true);
 });
 it('rejects obsolete success after selection changes while verification is pending',async()=>{
  const session=new CausalStudySession(), read=deferred<{projectId:string;datasetVersion:string}>();
  const pending=session.verify(source,session.capture(),()=>read.promise);
  session.setContext('new selection'); read.resolve({projectId:'p',datasetVersion:'v1'});
  expect(await pending).toBe(false);
 });
 it('invalidates work on unmount and distinguishes originating project identity',async()=>{
  const session=new CausalStudySession(),ticket=session.capture(); session.invalidate();
  expect(await session.verify(source,ticket,async()=>({projectId:'p',datasetVersion:'v1'}))).toBe(false);
  expect(await session.verify(source,session.capture(),async()=>({projectId:'other',datasetVersion:'v1'}))).toBe(false);
 });
});

import { vi } from 'vitest';
import { startCausalIdentityPolling } from './causalStudySessionService';
it('serializes polling and ignores delayed reads after cleanup or selection revision',async()=>{
 vi.useFakeTimers();
 try {
  const session=new CausalStudySession();const first=deferred<{projectId:string;datasetVersion:string}>();
  const publish=vi.fn();const read=vi.fn().mockImplementationOnce(()=>first.promise).mockResolvedValue({projectId:'p',datasetVersion:'v2'});
  const stop=startCausalIdentityPolling(session,read,publish);
  await vi.advanceTimersByTimeAsync(5000);expect(read).toHaveBeenCalledTimes(1);
  session.setContext('changed');first.resolve({projectId:'p',datasetVersion:'v1'});await vi.advanceTimersByTimeAsync(0);expect(publish).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1000);expect(publish).toHaveBeenLastCalledWith({projectId:'p',datasetVersion:'v2'});
  stop();await vi.advanceTimersByTimeAsync(5000);expect(read).toHaveBeenCalledTimes(2);
 }finally{vi.useRealTimers();}
});
it('polls fail closed on read errors and ignores a pending completion after unmount',async()=>{
 vi.useFakeTimers();
 try{
  const session=new CausalStudySession(),publish=vi.fn();
  const read=vi.fn().mockRejectedValueOnce(new Error('failed'));
  const stop=startCausalIdentityPolling(session,read,publish);await vi.advanceTimersByTimeAsync(0);expect(publish).toHaveBeenCalledWith(null);stop();
  const pending=deferred<{projectId:string;datasetVersion:string}>();const ignored=vi.fn();
  const stopPending=startCausalIdentityPolling(session,()=>pending.promise,ignored);stopPending();pending.resolve({projectId:'p',datasetVersion:'v1'});await vi.advanceTimersByTimeAsync(0);expect(ignored).not.toHaveBeenCalled();
 }finally{vi.useRealTimers();}
});
