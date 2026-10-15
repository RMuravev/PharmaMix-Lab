/**
 * Compatibility facade for the legacy UI. New code should use repositories under
 * infrastructure/indexeddb. Writes resolve only after transaction completion.
 */
import { LEGACY_STORES, assertStoreName, openPharmaDatabase } from '../../infrastructure/indexeddb/database';
import { requestResult, transactionDone } from '../../infrastructure/indexeddb/transaction';
import type { RawSalesRow, RawPromoRow, RawTVRow, RawVisitRow, RawMarketRow } from '../../types/pharma';

export interface DBStats {
  salesCount: number;
  promoCount: number;
  tvCount: number;
  visitsCount: number;
  marketCount: number;
  dbSizeBytesEstimated: number;
  isIndexedDBActive: boolean;
}

type LegacyStore = typeof LEGACY_STORES[number];
type DumpData = Partial<Record<LegacyStore, unknown[]>>;
interface LegacyPartitionRows {
  sales: RawSalesRow;
  promos: RawPromoRow;
  tv: RawTVRow;
  visits: RawVisitRow;
  market: RawMarketRow;
  meta: Record<string, unknown>;
}

export class PharmaBrowserDB {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private database(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = openPharmaDatabase().catch(error => {
        this.dbPromise = null;
        throw error;
      });
    }
    return this.dbPromise;
  }

  async init(): Promise<boolean> {
    try { await this.database(); return true; }
    catch (error) { console.error('[PharmaBrowserDB] IndexedDB init failed', error); return false; }
  }

  async savePartition(storeName: string, rows: unknown[]): Promise<void> {
    assertStoreName(storeName);
    if (!Array.isArray(rows)) throw new TypeError('Ожидался массив строк для сохранения.');
    const db = await this.database();
    const tx = db.transaction(storeName, 'readwrite');
    const done = transactionDone(tx);
    const store = tx.objectStore(storeName);
    store.clear();
    // Queue requests synchronously. Yielding with setTimeout inside a transaction can
    // deactivate IndexedDB transactions and previously caused partially saved datasets.
    for (const row of rows) store.add(row);
    await done;
  }

  async loadPartition<K extends LegacyStore>(storeName: K): Promise<LegacyPartitionRows[K][]> {
    assertStoreName(storeName);
    const db = await this.database();
    const tx = db.transaction(storeName, 'readonly');
    const done = transactionDone(tx);
    const result = await requestResult(tx.objectStore(storeName).getAll()) as LegacyPartitionRows[K][];
    await done;
    return result ?? [];
  }

  private async countStore(store: LegacyStore): Promise<number> {
    const db = await this.database();
    const tx = db.transaction(store, 'readonly');
    const done = transactionDone(tx);
    const count = await requestResult(tx.objectStore(store).count());
    await done;
    return count;
  }

  async getStats(): Promise<DBStats> {
    const [salesCount, promoCount, tvCount, visitsCount, marketCount] = await Promise.all([
      this.countStore('sales'), this.countStore('promos'), this.countStore('tv'),
      this.countStore('visits'), this.countStore('market'),
    ]);
    const totalRows = salesCount + promoCount + tvCount + visitsCount + marketCount;
    return {
      salesCount, promoCount, tvCount, visitsCount, marketCount,
      // This is an estimate, not a browser-reported physical database size.
      dbSizeBytesEstimated: totalRows * 180,
      isIndexedDBActive: true,
    };
  }

  async exportCompressedDump(): Promise<string> {
    const entries = await Promise.all(LEGACY_STORES.filter(name => name !== 'meta').map(async name => [name, await this.loadPartition(name)] as const));
    const data = Object.fromEntries(entries) as DumpData;
    const dump = {
      format: 'pharmamix-dump', version: '3.2', exportedAt: new Date().toISOString(),
      counts: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, value?.length ?? 0])), data,
    };
    // Keep the historical prefix for compatibility. The payload is Base64 encoded,
    // not compressed; a future format version can introduce real gzip compression.
    return `PHARMA_Z32_${encodeBase64Utf8(JSON.stringify(dump))}`;
  }

  async importCompressedDump(encoded: string): Promise<{ success: boolean; stats: DBStats | null; message: string }> {
    let dump: { data?: DumpData; version?: string };
    try {
      const raw = encoded.startsWith('PHARMA_Z32_') ? encoded.slice('PHARMA_Z32_'.length) : encoded;
      dump = JSON.parse(decodeBase64Utf8(raw));
    } catch (error) {
      return { success: false, stats: null, message: `Не удалось прочитать дамп: ${error instanceof Error ? error.message : String(error)}` };
    }
    if (!dump || !dump.data || typeof dump.data !== 'object') {
      return { success: false, stats: null, message: 'Неверный формат дампа PharmaMix Lab.' };
    }
    const normalized: Partial<Record<LegacyStore, unknown[]>> = {};
    for (const name of ['sales', 'promos', 'tv', 'visits', 'market'] as const) {
      const value = dump.data[name];
      if (value !== undefined && !Array.isArray(value)) return { success: false, stats: null, message: `Некорректный раздел ${name}: ожидался массив.` };
      if (Array.isArray(value)) normalized[name] = value;
    }

    // One transaction means all imported partitions commit together or none do.
    try {
      const db = await this.database();
      const stores = Object.keys(normalized);
      if (stores.length === 0) return { success: false, stats: null, message: 'В дампе нет поддерживаемых наборов данных.' };
      const tx = db.transaction(stores, 'readwrite');
      const done = transactionDone(tx);
      for (const name of stores) {
        const store = tx.objectStore(name);
        store.clear();
        for (const row of normalized[name as LegacyStore]!) store.add(row);
      }
      await done;
      const stats = await this.getStats();
      const total = stats.salesCount + stats.promoCount + stats.tvCount + stats.visitsCount + stats.marketCount;
      return { success: true, stats, message: `Дамп загружен. Всего записей: ${total.toLocaleString()}.` };
    } catch (error) {
      return { success: false, stats: null, message: `Импорт отменён; данные не были частично опубликованы: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  async clearAll(): Promise<void> {
    const db = await this.database();
    const names = [...LEGACY_STORES];
    const tx = db.transaction(names, 'readwrite');
    const done = transactionDone(tx);
    for (const name of names) tx.objectStore(name).clear();
    await done;
  }

  close(): void {
    if (!this.dbPromise) return;
    void this.dbPromise.then(db => db.close()).catch(() => undefined);
    this.dbPromise = null;
  }
}

export const pharmaDB = new PharmaBrowserDB();

function encodeBase64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  // Avoid spreading a large Uint8Array into String.fromCharCode in one call.
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length)));
  }
  return btoa(binary);
}

function decodeBase64Utf8(value: string): string {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
