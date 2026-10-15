import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { indexedDB as fakeIndexedDB, IDBKeyRange as FakeIDBKeyRange } from 'fake-indexeddb';
import { closePharmaDatabase, openPharmaDatabase } from './database';
import { PHARMA_DB_NAME, PHARMA_DB_VERSION } from './schema';
import { listCurrentEventStudyDiagnostics, saveEventStudyDiagnostics, type PersistedEventStudyDiagnostics } from './eventStudyDiagnosticsRepository';
import { ActiveDatasetSnapshotRepository } from './activeDatasetSnapshotRepository';
import { saveAnalysisResult, listAnalysisResults, type AnalysisRegistryRecord } from './analysisRegistryRepository';
import { readActiveCausalIdentity } from './activeCausalIdentityRepository';
import { ImportService } from '../../application/services/importService';
import { PharmaBrowserDB } from '../../modules/browser-db/browserDB';

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

function createV7WithLegacyData(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = fakeIndexedDB.open(PHARMA_DB_NAME, 7);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('projects', { keyPath: 'id' });
      request.result.createObjectStore('sales', { keyPath: 'id', autoIncrement: true });
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(['projects', 'sales'], 'readwrite');
      tx.objectStore('projects').put({ id: 'p1', name: 'Existing project' });
      tx.objectStore('sales').put({ id: 1, amount: 42 });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
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

describe('IndexedDB v7 → v8 integration', () => {
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

  it('preserves old stores and records and creates the compound diagnostic index', async () => {
    await createV7WithLegacyData();
    const db = await openPharmaDatabase();
    expect(db.version).toBe(PHARMA_DB_VERSION);
    expect(db.objectStoreNames.contains('sales')).toBe(true);
    expect(db.objectStoreNames.contains('eventStudyDiagnostics')).toBe(true);
    const tx = db.transaction(['projects', 'sales', 'eventStudyDiagnostics'], 'readonly');
    expect(tx.objectStore('eventStudyDiagnostics').indexNames.contains('projectId_datasetVersion')).toBe(true);
    const project = tx.objectStore('projects').get('p1');
    const sales = tx.objectStore('sales').get(1);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    expect(project.result.name).toBe('Existing project');
    expect(sales.result.amount).toBe(42);
  });

  it('isolates diagnostics by both project and published dataset version', async () => {
    await createV7WithLegacyData();
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

  it('returns a legacy empty snapshot without leaking orphaned versioned rows', async () => {
    const db = await openPharmaDatabase();
    const tx = db.transaction('salesFacts', 'readwrite');
    tx.objectStore('salesFacts').put({ id: 'orphan', projectId: 'p1', datasetVersion: 'v1' });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    const snapshot = await new ActiveDatasetSnapshotRepository().getForProject('p1');
    expect(snapshot.datasetVersion).toBeNull();
    expect(snapshot.legacy).toBe(true);
    expect(snapshot.salesFacts).toEqual([]);
  });

  it('preserves the import format and observed zeroes across a committed legacy import', async () => {
    const service = new ImportService();
    const sales = [{ month: '2026-01', region: 'R', city: 'City', chain: 'C', brand: 'B', sku: 'S', units: 0, salesRub: 0 }];
    expect(service.preview({ sales }, 'batch', 'csv-bundle').sourceFormat).toBe('csv-bundle');
    const result = await service.commit({ batchId: 'batch', projectId: 'p1', sourceFormat: 'csv-bundle', createdAt: '2026-10-15T00:00:00Z', partitions: { sales } });
    expect(result.success).toBe(true);
    expect(result.rowsImported).toBe(1);
    expect(await new PharmaBrowserDB().loadPartition('sales')).toEqual([expect.objectContaining(sales[0])]);
  });
});
