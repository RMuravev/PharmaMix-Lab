import { openPharmaDatabase } from '../../infrastructure/indexeddb/database';
import { transactionDone } from '../../infrastructure/indexeddb/transaction';
import type { ImportBundleRequest, ImportBundleResult } from './importBundleService';
import { ImportBundleService } from './importBundleService';
import type { ImportSourceType } from './unifiedImportService';
import type { StagingBatchRecord, StagingPreview, StagingStatus } from '../contracts/importStaging';

const SOURCES: readonly ImportSourceType[] = ['sales', 'market', 'promo', 'tv', 'visits'];
const now = () => new Date().toISOString();

/** Durable staging area. Staging never mutates published facts; publication remains explicitly per-source. */
export class ImportStagingService {
  constructor(private readonly publisher = new ImportBundleService()) {}

  preview(input: ImportBundleRequest): StagingPreview {
    const base = this.publisher.preview(input);
    return {
      batchId: base.batchId, projectId: base.projectId, sourceCount: base.sourceCount,
      totalRows: base.totalRows,
      sources: base.sources.map(source => ({ sourceType: source.sourceType, rowCount: source.rows })),
      errors: base.errors, valid: base.valid,
    };
  }

  async stage(input: ImportBundleRequest): Promise<StagingPreview> {
    const preview = this.preview(input);
    if (!preview.valid) return preview;
    const db = await openPharmaDatabase();
    const tx = db.transaction('importStaging', 'readwrite');
    const done = transactionDone(tx);
    const store = tx.objectStore('importStaging');
    // Perform writes inside the request callback. Awaiting a request and then writing
    // can hit TransactionInactiveError in browsers that auto-close idle transactions.
    const request = store.index('batchId').getAll(preview.batchId);
    let duplicateBatch = false;
    request.onsuccess = () => {
      try {
        const existingRows = request.result as StagingBatchRecord[];
        // Batch IDs are immutable idempotency keys. Never overwrite an existing batch,
        // especially one already published or currently being published.
        if (existingRows.length) {
          duplicateBatch = true;
          tx.abort();
          return;
        }
        const createdAt = now();
        for (const source of input.sources) {
          source.rows.forEach((row, rowIndex) => {
            const record: StagingBatchRecord = {
              id: `${preview.batchId}:${source.sourceType}:${rowIndex}`,
              batchId: preview.batchId, projectId: input.projectId, sourceType: source.sourceType,
              rowIndex, row, status: 'staged', createdAt, schemaVersion: 1,
            };
            store.put(record);
          });
        }
      } catch (error) {
        try { tx.abort(); } catch { /* transaction may already be inactive */ }
      }
    };
    request.onerror = () => { try { tx.abort(); } catch { /* handled by transactionDone */ } };
    try {
      await done;
    } catch (error) {
      if (duplicateBatch) throw new Error(`Пакет ${preview.batchId} уже существует. Используйте новый batchId; существующий пакет не изменён.`);
      throw error;
    }
    return preview;
  }

  async publish(batchId: string): Promise<ImportBundleResult> {
    const db = await openPharmaDatabase();
    const readTx = db.transaction('importStaging', 'readonly');
    const readDone = transactionDone(readTx);
    const rows = await requestAllByIndex(readTx.objectStore('importStaging').index('batchId'), batchId);
    await readDone;
    if (!rows.length) throw new Error(`Пакет ${batchId} не найден в staging.`);
    if (rows.some(row => row.status !== 'staged')) throw new Error('Пакет уже опубликован, отменён или находится в ошибочном состоянии.');
    const projectId = rows[0].projectId;
    if (rows.some(row => row.projectId !== projectId)) throw new Error('Пакет содержит строки разных проектов.');
    const sourceTypes = [...new Set(rows.map(row => row.sourceType))];
    const sources = sourceTypes.map(sourceType => ({
      sourceType,
      rows: rows.filter(row => row.sourceType === sourceType).sort((a, b) => a.rowIndex - b.rowIndex).map(row => row.row),
    }));
    if (sourceTypes.some(source => !SOURCES.includes(source))) throw new Error('Пакет содержит неизвестный тип источника.');
    await this.updateStatus(batchId, 'publishing', ['staged']);
    try {
      const result = await this.publisher.commit({ projectId, batchId, sources });
      await this.updateStatus(batchId, result.status === 'completed' ? 'published' : result.status === 'partial' ? 'partially-published' : 'failed', ['publishing']);
      return result;
    } catch (error) {
      await this.updateStatus(batchId, 'failed', ['publishing']);
      throw error;
    }
  }

  async discard(batchId: string): Promise<void> {
    const db = await openPharmaDatabase();
    const tx = db.transaction('importStaging', 'readwrite');
    const done = transactionDone(tx);
    const store = tx.objectStore('importStaging');
    const request = store.index('batchId').getAll(batchId);
    request.onsuccess = () => {
      const rows = request.result as StagingBatchRecord[];
      // Validate the whole batch before queuing any deletes.
      if (rows.some(row => row.status === 'published' || row.status === 'partially-published' || row.status === 'publishing')) {
        try { tx.abort(); } catch { /* handled by transactionDone */ }
        return;
      }
      for (const row of rows) store.delete(row.id);
    };
    request.onerror = () => { try { tx.abort(); } catch { /* handled by transactionDone */ } };
    try { await done; } catch (error) {
      if (request.result?.some((row: StagingBatchRecord) => row.status === 'published' || row.status === 'partially-published' || row.status === 'publishing')) {
        throw new Error('Опубликованный или публикуемый пакет нельзя удалить из staging через discard.');
      }
      throw error;
    }
  }

  private async updateStatus(
    batchId: string,
    status: StagingStatus,
    allowedFrom: readonly StagingStatus[] = ['staged', 'publishing', 'failed'],
  ): Promise<void> {
    const db = await openPharmaDatabase();
    const tx = db.transaction('importStaging', 'readwrite');
    const done = transactionDone(tx);
    const store = tx.objectStore('importStaging');
    const request = store.index('batchId').getAll(batchId);
    let stateError: string | undefined;
    request.onsuccess = () => {
      const rows = request.result as StagingBatchRecord[];
      if (!rows.length) {
        stateError = `Пакет ${batchId} не найден в staging.`;
        try { tx.abort(); } catch { /* handled by done */ }
        return;
      }
      if (rows.some(row => !allowedFrom.includes(row.status))) {
        stateError = `Недопустимый переход статуса пакета ${batchId} в «${status}».`;
        try { tx.abort(); } catch { /* handled by done */ }
        return;
      }
      for (const row of rows) store.put({ ...row, status });
    };
    request.onerror = () => { try { tx.abort(); } catch { /* handled by done */ } };
    try {
      await done;
    } catch (error) {
      if (stateError) throw new Error(stateError);
      throw error;
    }
  }

}

function requestAllByIndex(index: IDBIndex, query: IDBValidKey): Promise<StagingBatchRecord[]> {
  return new Promise((resolve, reject) => {
    const request = index.getAll(query);
    request.onsuccess = () => resolve(request.result as StagingBatchRecord[]);
    request.onerror = () => reject(request.error ?? new Error('Не удалось прочитать staging-пакет.'));
  });
}
