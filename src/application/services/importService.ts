import { LEGACY_STORES, type LegacyStoreName } from '../../infrastructure/indexeddb/schema';
import { openPharmaDatabase } from '../../infrastructure/indexeddb/database';
import { transactionDone } from '../../infrastructure/indexeddb/transaction';
import type { ImportPayload, ImportPreview, ImportResult } from '../contracts/import';
import { validateImportPartitions } from './importValidation';

export class ImportService {
  preview(partitions: Partial<Record<LegacyStoreName, unknown[]>>, batchId = crypto.randomUUID()): ImportPreview {
    return validateImportPartitions(partitions, batchId);
  }

  /** Atomically replaces supplied legacy partitions and writes the import journal in the same transaction. */
  async commit(payload: ImportPayload): Promise<ImportResult> {
    const preview = this.preview(payload.partitions, payload.batchId, payload.sourceFormat);
    if (!preview.valid) return { success: false, batchId: payload.batchId, rowsImported: 0, message: preview.errors.join(' ') };
    const stores = (Object.keys(payload.partitions) as LegacyStoreName[]).filter(name => LEGACY_STORES.includes(name) && name !== 'meta');
    if (!stores.length) return { success: false, batchId: payload.batchId, rowsImported: 0, message: 'Нет поддерживаемых разделов для импорта.' };
    try {
      const db = await openPharmaDatabase();
      const tx = db.transaction([...stores, 'importBatches'], 'readwrite');
      const done = transactionDone(tx);
      const batchStore = tx.objectStore('importBatches');
      const base = { id: payload.batchId, projectId: payload.projectId, sourceFormat: payload.sourceFormat,
        createdAt: payload.createdAt, schemaVersion: 1, partitions: preview.partitions, totalRows: preview.totalRows };
      batchStore.put({ ...base, status: 'committing', updatedAt: payload.createdAt });
      for (const name of stores) {
        const store = tx.objectStore(name);
        store.clear();
        for (const row of payload.partitions[name] ?? []) store.add(row);
      }
      batchStore.put({ ...base, status: 'committed', updatedAt: new Date().toISOString() });
      await done;
      return { success: true, batchId: payload.batchId, rowsImported: preview.totalRows, message: `Импортировано записей: ${preview.totalRows.toLocaleString()}.` };
    } catch (error) {
      return { success: false, batchId: payload.batchId, rowsImported: 0, message: `Импорт не опубликован: ${error instanceof Error ? error.message : String(error)}` };
    }
  }
}
