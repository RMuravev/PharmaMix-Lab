import { PHARMA_DB_NAME, PHARMA_DB_VERSION, STORES, type StoreName } from './schema';

const KEY_PATH_STORES = new Set<string>([
  'projects', 'salesFacts', 'marketFacts', 'promoFacts',
  'tvFacts', 'visitFacts', 'dimensions', 'aggregates', 'calculationJobs', 'datasetVersions', 'modelRuns',
  'modelResults', 'scenarioResults', 'appMeta', 'analysisRegistry', 'eventStudyDiagnostics',
  'importBatches', 'mappingProfiles',
]);

function createIndexes(store: IDBObjectStore, name: string) {
  type IndexDef = { path: string | string[]; options?: IDBIndexParameters };
  const one = (path: string): IndexDef => ({ path });
  const compound = (path: string[], options?: IDBIndexParameters): IndexDef => ({ path, options });
  const indexes: Record<string, IndexDef[]> = {
    projects: [one('updatedAt'), one('name')],
    datasetVersions: [one('projectId'), compound(['projectId', 'status']), compound(['projectId', 'version']), compound(['projectId', 'createdAt'])],
    salesFacts: [one('projectId'), compound(['projectId', 'datasetVersion']), compound(['projectId', 'period']), compound(['projectId', 'brand']), compound(['projectId', 'region']), compound(['projectId', 'chain']), compound(['projectId', 'sku']), compound(['projectId', 'period', 'brand'])],
    marketFacts: [one('projectId'), compound(['projectId', 'datasetVersion']), compound(['projectId', 'period']), compound(['projectId', 'brand']), compound(['projectId', 'region']), compound(['projectId', 'sku'])],
    promoFacts: [one('projectId'), compound(['projectId', 'datasetVersion']), compound(['projectId', 'period']), compound(['projectId', 'brand']), compound(['projectId', 'chain']), compound(['projectId', 'sku']), compound(['projectId', 'mechanic'])],
    tvFacts: [one('projectId'), compound(['projectId', 'datasetVersion']), compound(['projectId', 'period']), compound(['projectId', 'brand'])],
    visitFacts: [one('projectId'), compound(['projectId', 'datasetVersion']), compound(['projectId', 'period']), compound(['projectId', 'brand']), compound(['projectId', 'region'])],
    dimensions: [one('projectId'), compound(['projectId', 'dimensionType']), compound(['projectId', 'value'])],
    aggregates: [one('projectId'), compound(['projectId', 'aggregateType']), compound(['projectId', 'cacheKey'], { unique: true }), compound(['projectId', 'status'])],
    calculationJobs: [one('projectId'), compound(['projectId', 'status']), one('createdAt')],
    modelRuns: [one('projectId'), compound(['projectId', 'modelType']), compound(['projectId', 'datasetVersion']), one('createdAt')],
    modelResults: [one('projectId'), one('runId'), one('resultType'), compound(['projectId', 'datasetVersion'])],
    scenarioResults: [one('projectId'), one('scenarioId'), one('createdAt'), compound(['projectId', 'datasetVersion'])],
    appMeta: [one('key')],
    eventStudyDiagnostics: [one('projectId'), compound(['projectId', 'datasetVersion']), compound(['projectId', 'createdAt'])],
    analysisRegistry: [one('projectId'), compound(['projectId', 'datasetVersion']), compound(['projectId', 'kind']), compound(['projectId', 'createdAt'])],
    importBatches:[one('projectId'),compound(['projectId','sourceType']),compound(['projectId','stagedAt'])],
    mappingProfiles:[one('sourceType'),one('updatedAt')],
  };
  for (const { path, options } of indexes[name] ?? []) {
    const indexName = Array.isArray(path) ? path.join('_') : path;
    if (!store.indexNames.contains(indexName)) store.createIndex(indexName, path, options ?? {});
  }
}

let cachedDatabase: Promise<IDBDatabase> | null = null;
// A superseded open request must never invalidate a newer connection.
let connectionGeneration = 0;

export function openPharmaDatabase(): Promise<IDBDatabase> {
  if (cachedDatabase) return cachedDatabase;
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB недоступен в этом окружении.'));
  const generation = ++connectionGeneration;
  const clearIfCurrent = () => {
    if (connectionGeneration === generation) cachedDatabase = null;
  };
  cachedDatabase = new Promise((resolve, reject) => {
    let blocked = false;
    const request = indexedDB.open(PHARMA_DB_NAME, PHARMA_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of STORES) {
        const store = db.objectStoreNames.contains(name)
          ? request.transaction!.objectStore(name)
          : KEY_PATH_STORES.has(name)
            ? db.createObjectStore(name, { keyPath: 'id' })
            : db.createObjectStore(name, { keyPath: 'id', autoIncrement: true });
        createIndexes(store, name);
      }
    };
    request.onerror = () => { clearIfCurrent(); reject(request.error ?? new Error('Не удалось открыть IndexedDB.')); };
    // An aborted upgrade must not poison subsequent attempts to open the database.
    request.addEventListener('upgradeneeded', () => {
      request.transaction?.addEventListener('abort', clearIfCurrent);
    });
    request.onblocked = () => { blocked = true; clearIfCurrent(); reject(new Error('Обновление БД заблокировано другой открытой вкладкой. Закройте другие вкладки PharmaMix Lab и повторите.')); };
    request.onsuccess = () => {
      const db = request.result;
      // A blocked request may succeed after its caller has already received a rejection.
      // Do not leave that orphan connection open or poison a subsequent retry.
      if (blocked || connectionGeneration !== generation) { db.close(); return; }
      db.onversionchange = () => { db.close(); clearIfCurrent(); };
      db.onclose = clearIfCurrent;
      resolve(db);
    };
  });
  return cachedDatabase;
}

/** Close a cached connection before a project reset or an IndexedDB integration test. */
export async function closePharmaDatabase(): Promise<void> {
  const pending = cachedDatabase;
  cachedDatabase = null;
  connectionGeneration++;
  if (pending) {
    try { (await pending).close(); } catch { /* Opening may already have failed. */ }
  }
}

export function assertStoreName(name: string): asserts name is StoreName {
  if (!(STORES as readonly string[]).includes(name)) throw new Error(`Неизвестное хранилище IndexedDB: ${name}`);
}
