import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { indexedDB as fakeIndexedDB, IDBKeyRange as FakeIDBKeyRange } from 'fake-indexeddb';
import { closePharmaDatabase, openPharmaDatabase } from './database';
import { PHARMA_DB_NAME, PHARMA_DB_VERSION } from './schema';
import { listCurrentEventStudyDiagnostics, saveEventStudyDiagnostics, type PersistedEventStudyDiagnostics } from './eventStudyDiagnosticsRepository';

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
});
