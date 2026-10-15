import { assertStoreName, openPharmaDatabase } from './database';
import { requestResult, transactionDone } from './transaction';
import type { PageRequest, PageResult } from '../../application/contracts/repositories';

/** Small typed repository primitive; domain-specific repositories should wrap this API. */
export class IndexedDbRepository<T extends { id?: IDBValidKey }> {
  constructor(private readonly storeName: string) { assertStoreName(storeName); }

  async getById(id: IDBValidKey): Promise<T | undefined> {
    const db = await openPharmaDatabase();
    const tx = db.transaction(this.storeName, 'readonly');
    const done = transactionDone(tx);
    const row = await requestResult(tx.objectStore(this.storeName).get(id)) as T | undefined;
    await done;
    return row;
  }

  async getByIndex(indexName: string, key: IDBValidKey | IDBKeyRange): Promise<T | undefined> {
    const db = await openPharmaDatabase();
    const tx = db.transaction(this.storeName, 'readonly');
    const done = transactionDone(tx);
    const store = tx.objectStore(this.storeName);
    if (!store.indexNames.contains(indexName)) {
      tx.abort();
      throw new Error(`Индекс ${indexName} отсутствует в хранилище ${this.storeName}.`);
    }
    const row = await requestResult(store.index(indexName).get(key)) as T | undefined;
    await done;
    return row;
  }

  async count(): Promise<number> {
    const db = await openPharmaDatabase();
    const tx = db.transaction(this.storeName, 'readonly');
    const done = transactionDone(tx);
    const count = await requestResult(tx.objectStore(this.storeName).count());
    await done;
    return count;
  }

  async getPage(request: PageRequest = {}): Promise<PageResult<T>> {
    const offset = Math.max(0, Math.floor(request.offset ?? 0));
    const limit = Math.min(5000, Math.max(1, Math.floor(request.limit ?? 100)));
    const db = await openPharmaDatabase();
    const tx = db.transaction(this.storeName, 'readonly');
    const done = transactionDone(tx);
    const store = tx.objectStore(this.storeName);
    const [total, rows] = await Promise.all([
      requestResult(store.count()),
      new Promise<T[]>((resolve, reject) => {
        const result: T[] = [];
        let skipped = 0;
        const cursorRequest = store.openCursor();
        cursorRequest.onerror = () => reject(cursorRequest.error ?? new Error('Не удалось прочитать страницу данных.'));
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor || result.length >= limit) { resolve(result); return; }
          if (skipped < offset) skipped++;
          else result.push(cursor.value as T);
          cursor.continue();
        };
      }),
    ]);
    await done;
    return { rows, total, offset, limit };
  }

  async put(row: T): Promise<void> {
    const db = await openPharmaDatabase();
    const tx = db.transaction(this.storeName, 'readwrite');
    const done = transactionDone(tx);
    tx.objectStore(this.storeName).put(row);
    await done;
  }

  async delete(id: IDBValidKey): Promise<void> {
    const db = await openPharmaDatabase();
    const tx = db.transaction(this.storeName, 'readwrite');
    const done = transactionDone(tx);
    tx.objectStore(this.storeName).delete(id);
    await done;
  }
}
