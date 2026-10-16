import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { indexedDB as fakeIndexedDB, IDBKeyRange as FakeIDBKeyRange } from 'fake-indexeddb';
import { closePharmaDatabase, openPharmaDatabase } from './database';
import { PHARMA_DB_NAME, PHARMA_DB_VERSION } from './schema';
import { listCurrentEventStudyDiagnostics, listEventStudyDiagnostics, saveEventStudyDiagnostics, type PersistedEventStudyDiagnostics } from './eventStudyDiagnosticsRepository';
import { ActiveDatasetSnapshotRepository } from './activeDatasetSnapshotRepository';
import { saveAnalysisResult, listAnalysisResults, type AnalysisRegistryRecord } from './analysisRegistryRepository';
import { readActiveCausalIdentity } from './activeCausalIdentityRepository';
import { VersionedDatasetPublisher, type VersionedDatasetInput } from '../../application/services/versionedDatasetPublisher';
import { persistModelTournament } from '../../application/services/modelTournamentPersistenceService';
import type { ModelTournamentReport } from '../../application/services/modelTournamentService';

const globalScope = globalThis as typeof globalThis & { indexedDB: IDBFactory; IDBKeyRange: typeof IDBKeyRange };
const previousIndexedDB = globalScope.indexedDB;
const previousKeyRange = globalScope.IDBKeyRange;

function deleteDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = fakeIndexedDB.deleteDatabase(PHARMA_DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('A database connection was left open.'));
  });
}

function diagnostic(id: string, projectId: string, datasetVersion: string): PersistedEventStudyDiagnostics {
  return {
    id, projectId, datasetVersion, createdAt: '2026-10-15T10:00:00Z', algorithmVersion: 'v1',
    brand: 'Brand', grain: 'visits-region-brand', driver: 'weightedVisits', outcome: 'salesRub',
    preMonths: 3, postMonths: 3, eligibleUnits: ['region-1'], calendar: ['2026-01', '2026-02'],
    report: { points: [], jointPretrendPValue: null, pretrendMaxAbsolute: null, pretrendStatus: 'not-testable', missingEventTimes: [], warnings: [], bootstrapIterations: 400 },
    gate: { methodologicalStatus: 'blocked', statisticalStatus: 'unavailable', eligibleForAutomaticCalibration: false, reasons: [] },
  } as PersistedEventStudyDiagnostics;
}

describe('current IndexedDB integration', () => {
  beforeEach(async () => {
    globalScope.indexedDB = fakeIndexedDB;
    globalScope.IDBKeyRange = FakeIDBKeyRange;
    await closePharmaDatabase();
    await deleteDatabase();
  });
  afterEach(async () => {
    await closePharmaDatabase();
    await deleteDatabase();
    globalScope.indexedDB = previousIndexedDB;
    globalScope.IDBKeyRange = previousKeyRange;
  });

  it('creates only current stores and the compound diagnostic index', async () => {
    const db = await openPharmaDatabase();
    expect(db.version).toBe(PHARMA_DB_VERSION);
    for (const name of ['sales','promos','tv','visits','market','meta','datasets','importBatches','importStaging']) {
      expect(db.objectStoreNames.contains(name)).toBe(false);
    }
    expect(db.objectStoreNames.contains('eventStudyDiagnostics')).toBe(true);
    const tx = db.transaction(['projects', 'eventStudyDiagnostics'], 'readonly');
    expect(tx.objectStore('eventStudyDiagnostics').indexNames.contains('projectId_datasetVersion')).toBe(true);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  });

  it('persists tournament provenance atomically and rejects a stale dataset version', async () => {
    const db=await openPharmaDatabase(), publish=db.transaction('projects','readwrite');publish.objectStore('projects').put({id:'p1',activeDatasetVersion:'v2'});
    await new Promise<void>((resolve,reject)=>{publish.oncomplete=()=>resolve();publish.onerror=()=>reject(publish.error);});
    const report:ModelTournamentReport={algorithmVersion:'model-tournament-v2',candidates:[],comparisons:[],recommendation:{decision:'insufficient-evidence',championId:null,contenderIds:[],excludedCandidateIds:[],explanation:['fixture']},limitations:['fixture']};
    const provenance={projectId:'p1',datasetVersion:'v2',brand:'Brand',featureNames:['tvTrp'],candidateIds:['seasonal-naive'] as const,minTrainPeriods:8,testWindow:1,lambdas:[.1]};
    const saved=await persistModelTournament(report,provenance);expect(saved.datasetVersion).toBe('v2');
    const tx=db.transaction(['modelRuns','modelResults'],'readonly'),run=await new Promise<Record<string,unknown>>((resolve,reject)=>{const request=tx.objectStore('modelRuns').get(saved.runId);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
    expect(run).toMatchObject({projectId:'p1',datasetVersion:'v2',modelType:'model-tournament',algorithmVersion:'model-tournament-v2'});
    await expect(persistModelTournament(report,{...provenance,datasetVersion:'v1'})).rejects.toThrow(/changed|измен/);
  });

  it('isolates diagnostics by both project and published dataset version', async () => {
    await saveEventStudyDiagnostics(diagnostic('a', 'p1', 'v1'));
    await saveEventStudyDiagnostics(diagnostic('b', 'p1', 'v2'));
    await saveEventStudyDiagnostics(diagnostic('c', 'p2', 'v1'));
    expect((await listCurrentEventStudyDiagnostics('p1', 'v1')).map(r => r.id)).toEqual(['a']);
    expect((await listCurrentEventStudyDiagnostics('p1', 'v2')).map(r => r.id)).toEqual(['b']);
    expect(await listCurrentEventStudyDiagnostics('p2', 'v2')).toEqual([]);
  });

  it('atomically rejects stale or cancelled automatic writes for both causal stores',async()=>{
    const db=await openPharmaDatabase();
    const publish=async(version:string)=>{const tx=db.transaction('projects','readwrite');tx.objectStore('projects').put({id:'p1',activeDatasetVersion:version});await new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});};
    await publish('v1');
    expect(await readActiveCausalIdentity('p1')).toEqual({projectId:'p1',datasetVersion:'v1'});
    const record:AnalysisRegistryRecord={id:'matched',projectId:'p1',datasetVersion:'v1',createdAt:'2026-01-01',algorithmVersion:'v1',kind:'causal',definition:'promo',effect:{source:'causal',driver:'promoActive',outcome:'salesRub',periodStart:'2026-01',periodEnd:'2026-02',populationKey:'pairs',incrementalTotal:1,unitMonths:2}};
    // Publication between computation/verification and persistence must revoke eligibility.
    await publish('v2');
    await expect(saveAnalysisResult(record,{isCurrent:()=>true})).rejects.toBeDefined();
    await expect(saveEventStudyDiagnostics(diagnostic('auto','p1','v1'),{isCurrent:()=>true})).rejects.toBeDefined();
    await publish('v1');
    await expect(saveAnalysisResult(record,{isCurrent:()=>false})).rejects.toBeDefined();
    await expect(saveEventStudyDiagnostics(diagnostic('auto','p1','v1'),{isCurrent:()=>false})).rejects.toBeDefined();
    expect(await listAnalysisResults('p1')).toEqual([]);
    expect(await listCurrentEventStudyDiagnostics('p1','v1')).toEqual([]);
    await saveAnalysisResult(record,{isCurrent:()=>true});
    await saveEventStudyDiagnostics(diagnostic('auto','p1','v1'),{isCurrent:()=>true});
    expect((await listAnalysisResults('p1')).map(r=>r.id)).toEqual(['matched']);
    expect((await listCurrentEventStudyDiagnostics('p1','v1')).map(r=>r.id)).toEqual(['auto']);
  });

  it('does not persist invalid numerical diagnostics through either save path',async()=>{
    const db=await openPharmaDatabase();const tx=db.transaction('projects','readwrite');tx.objectStore('projects').put({id:'p1',activeDatasetVersion:'v1'});
    await new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});
    const invalid=diagnostic('invalid','p1','v1');invalid.report.pretrendMaxAbsolute=Infinity;
    await expect(saveEventStudyDiagnostics(invalid)).rejects.toThrow();
    await expect(saveEventStudyDiagnostics(invalid,{isCurrent:()=>true})).rejects.toThrow();
    expect(await listCurrentEventStudyDiagnostics('p1','v1')).toEqual([]);
    // Old/corrupt records written outside today's validator must also fail closed on read.
    const corrupt=db.transaction('eventStudyDiagnostics','readwrite');corrupt.objectStore('eventStudyDiagnostics').put(invalid);
    await new Promise<void>((resolve,reject)=>{corrupt.oncomplete=()=>resolve();corrupt.onerror=()=>reject(corrupt.error);});
    await expect(listCurrentEventStudyDiagnostics('p1','v1')).rejects.toThrow();
  });

  it('rejects contradictory finite reports on both write and both read paths',async()=>{
    const db=await openPharmaDatabase();const publish=db.transaction('projects','readwrite');publish.objectStore('projects').put({id:'p1',activeDatasetVersion:'v1'});
    await new Promise<void>((resolve,reject)=>{publish.oncomplete=()=>resolve();publish.onerror=()=>reject(publish.error);});
    const contradictions=[
      {jointPretrendPValue:null,pretrendMaxAbsolute:null,pretrendStatus:'rejected' as const},
      {jointPretrendPValue:.01,pretrendMaxAbsolute:null,pretrendStatus:'not-rejected' as const},
      {jointPretrendPValue:null,pretrendMaxAbsolute:10,pretrendStatus:'not-testable' as const},
    ];
    for(const contradiction of contradictions){
      const invalid=diagnostic('contradictory','p1','v1');invalid.report={...invalid.report,...contradiction};
      await expect(saveEventStudyDiagnostics(invalid)).rejects.toThrow();
      await expect(saveEventStudyDiagnostics(invalid,{isCurrent:()=>true})).rejects.toThrow();
      const raw=db.transaction('eventStudyDiagnostics','readwrite');raw.objectStore('eventStudyDiagnostics').put(invalid);
      await new Promise<void>((resolve,reject)=>{raw.oncomplete=()=>resolve();raw.onerror=()=>reject(raw.error);});
      await expect(listCurrentEventStudyDiagnostics('p1','v1')).rejects.toThrow();
      await expect(listEventStudyDiagnostics('p1')).rejects.toThrow();
    }
  });

  it('reopens cleanly after an explicit close', async () => {
    const first = await openPharmaDatabase();
    await closePharmaDatabase();
    const second = await openPharmaDatabase();
    expect(second).not.toBe(first);
    expect(second.version).toBe(PHARMA_DB_VERSION);
  });

  it('does not let an obsolete versionchange handler clear a new connection', async () => {
    const first = await openPharmaDatabase();
    await closePharmaDatabase();
    const second = await openPharmaDatabase();
    // A delayed callback from an obsolete connection must not evict the current one.
    first.onversionchange?.({ type: 'versionchange' } as IDBVersionChangeEvent);
    expect(await openPharmaDatabase()).toBe(second);
  });

  it('does not open multiple databases when called concurrently', async () => {
    const [first, second] = await Promise.all([openPharmaDatabase(), openPharmaDatabase()]);
    expect(first).toBe(second);
  });

  it('keeps active sales isolated from stale versions and other projects', async () => {
    const db = await openPharmaDatabase();
    const tx = db.transaction(['projects', 'salesFacts'], 'readwrite');
    tx.objectStore('projects').put({ id: 'p1', activeDatasetVersion: 'v2' });
    const sale = { period: '2026-01', region: 'R', chain: 'C', brand: 'B', sku: 'S', units: 0, revenueRub: 0 };
    for (const row of [
      { ...sale, id: 'current', projectId: 'p1', datasetVersion: 'v2' },
      { ...sale, id: 'stale', projectId: 'p1', datasetVersion: 'v1', revenueRub: 999 },
      { ...sale, id: 'other', projectId: 'p2', datasetVersion: 'v2', revenueRub: 999 },
    ]) tx.objectStore('salesFacts').put(row);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    const snapshot = await new ActiveDatasetSnapshotRepository().getForProject('p1');
    expect(snapshot.salesFacts.map(row => row.id)).toEqual(['current']);
    expect(snapshot.salesFacts[0].revenueRub).toBe(0);
    expect(snapshot.rowCounts.salesFacts).toBe(1);
    expect(snapshot.tvFacts).toEqual([]); // Missing TV remains missing, not zero TRP.
  });

  it('keeps the complete active snapshot unchanged when a replacement write aborts', async () => {
    const publisher = new VersionedDatasetPublisher();
    const snapshot = (id: string, revenueRub: number): VersionedDatasetInput => {
      const sale = { id, projectId: 'p1', datasetVersion: 'incoming', period: '2026-01', region: 'R', city: 'C', chain: 'Chain', brand: 'B', sku: 'S', units: 1, revenueRub };
      return { salesFacts: [sale], marketFacts: [], promoFacts: [], tvFacts: [], visitFacts: [] };
    };
    const first = await publisher.publish('p1', snapshot('v1-sale', 100));
    const invalidRow = { ...snapshot('v2-sale', 999).salesFacts[0], nonCloneable: () => undefined };
    const invalid: VersionedDatasetInput = { ...snapshot('unused', 0), salesFacts: [invalidRow] };

    await expect(publisher.publish('p1', invalid)).rejects.toBeDefined();

    const active = await new ActiveDatasetSnapshotRepository().getForProject('p1');
    expect(active.datasetVersion).toBe(first.datasetVersion);
    expect(active.salesFacts).toEqual([expect.objectContaining({ revenueRub: 100 })]);
    expect(active.rowCounts.salesFacts).toBe(1);
  });

  it('returns an empty snapshot without an active pointer and never leaks orphaned rows', async () => {
    const db = await openPharmaDatabase();
    const tx = db.transaction('salesFacts', 'readwrite');
    tx.objectStore('salesFacts').put({ id: 'orphan', projectId: 'p1', datasetVersion: 'v1' });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    const snapshot = await new ActiveDatasetSnapshotRepository().getForProject('p1');
    expect(snapshot.datasetVersion).toBeNull();
    expect(snapshot.salesFacts).toEqual([]);
  });
});
