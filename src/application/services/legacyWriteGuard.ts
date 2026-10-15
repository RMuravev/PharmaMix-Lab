import { openPharmaDatabase } from '../../infrastructure/indexeddb/database';
import { transactionDone } from '../../infrastructure/indexeddb/transaction';

/**
 * Prevents old per-source importers from deleting or replacing facts after a versioned
 * snapshot has been activated. Those importers do not yet stage a complete multi-source
 * snapshot and therefore cannot safely mutate a versioned project.
 */
export async function assertLegacyWriteAllowed(projectId: string): Promise<void> {
  if (!projectId.trim()) throw new Error('projectId обязателен.');
  const db = await openPharmaDatabase();
  const tx = db.transaction('projects', 'readonly');
  const done = transactionDone(tx);
  const request = tx.objectStore('projects').get(projectId);
  let activeVersion: string | undefined;
  request.onsuccess = () => {
    activeVersion = (request.result as { activeDatasetVersion?: string } | undefined)?.activeDatasetVersion;
  };
  request.onerror = () => { try { tx.abort(); } catch { /* transactionDone reports the error */ } };
  await done;
  if (activeVersion) {
    throw new Error('Импорт через устаревший одноканальный путь заблокирован: у проекта есть активная версия набора данных. Используйте версионную публикацию полного снимка.');
  }
}
