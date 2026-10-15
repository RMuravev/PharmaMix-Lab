import type { SalesFact } from '../../domain/shared/facts';
import type { AggregateRecord } from '../../infrastructure/indexeddb/schema';
import { openPharmaDatabase } from '../../infrastructure/indexeddb/database';
import { transactionDone } from '../../infrastructure/indexeddb/transaction';
import { OverviewAggregateService } from './overviewAggregateService';

export interface OverviewViewData {
  aggregate: AggregateRecord;
  aggregateReady: boolean;
  sourceRows: number;
  dataVersion: string;
  legacyData: boolean;
}

interface ReadResult {
  facts: SalesFact[];
  dataVersion: string;
  legacyData: boolean;
  datasetMetadata?: { version?: number; fingerprint?: string };
}

/**
 * Version-aware Overview query. The project pointer and fact rows are read in a single
 * readonly transaction, so a publication cannot make this query mix two dataset versions.
 * Legacy projects remain readable until their first versioned snapshot is published.
 */
export class OverviewQueryService {
  constructor(private readonly aggregates = new OverviewAggregateService()) {}

  async execute(projectId: string): Promise<OverviewViewData> {
    if (!projectId.trim()) throw new Error('Для загрузки Overview необходимо указать projectId.');
    const db = await openPharmaDatabase();
    const tx = db.transaction(['projects', 'salesFacts', 'datasets'], 'readonly');
    const done = transactionDone(tx);

    const readResult = new Promise<ReadResult>((resolve, reject) => {
      const projectRequest = tx.objectStore('projects').get(projectId);
      projectRequest.onerror = () => reject(projectRequest.error ?? new Error('Не удалось прочитать проект.'));
      projectRequest.onsuccess = () => {
        const project = projectRequest.result as { activeDatasetVersion?: string } | undefined;
        const factsStore = tx.objectStore('salesFacts');
        if (project?.activeDatasetVersion) {
          const factsRequest = factsStore.index('projectId_datasetVersion').getAll(
            IDBKeyRange.only([projectId, project.activeDatasetVersion]),
          );
          factsRequest.onerror = () => reject(factsRequest.error ?? new Error('Не удалось прочитать активные продажи.'));
          factsRequest.onsuccess = () => resolve({
            facts: factsRequest.result as SalesFact[],
            dataVersion: project.activeDatasetVersion!,
            legacyData: false,
          });
          return;
        }

        // Backward compatibility: only use legacy facts when no active snapshot pointer exists.
        const factsRequest = factsStore.index('projectId').getAll(IDBKeyRange.only(projectId));
        const metadataRequest = tx.objectStore('datasets').index('projectId_sourceType').get([projectId, 'sales']);
        let facts: SalesFact[] | undefined;
        let metadata: { version?: number; fingerprint?: string } | undefined;
        let factsDone = false;
        let metadataDone = false;
        const finish = () => {
          if (!factsDone || !metadataDone) return;
          const fallbackVersion = metadata?.fingerprint
            ? `${metadata.version ?? 0}:${metadata.fingerprint}`
            : `legacy:${projectId}`;
          resolve({ facts: facts ?? [], dataVersion: fallbackVersion, legacyData: true, datasetMetadata: metadata });
        };
        factsRequest.onsuccess = () => { facts = factsRequest.result as SalesFact[]; factsDone = true; finish(); };
        factsRequest.onerror = () => reject(factsRequest.error ?? new Error('Не удалось прочитать продажи.'));
        metadataRequest.onsuccess = () => { metadata = metadataRequest.result as typeof metadata; metadataDone = true; finish(); };
        metadataRequest.onerror = () => reject(metadataRequest.error ?? new Error('Не удалось прочитать метаданные продаж.'));
      };
    });

    let snapshot: ReadResult;
    try {
      snapshot = await readResult;
      await done;
    } catch (error) {
      try { tx.abort(); } catch { /* transaction may already be complete */ }
      throw error;
    }

    if (!snapshot.facts.length) {
      throw new Error(snapshot.legacyData
        ? 'Для этого проекта нет нормализованных продаж. Импортируйте данные или опубликуйте полный снимок.'
        : 'В активной версии нет фактов продаж. Проверьте снимок или выполните откат к предыдущей версии.');
    }

    const aggregate = await this.aggregates.getOrBuild({
      projectId,
      datasetVersion: snapshot.dataVersion,
      rows: snapshot.facts.map(fact => ({ period: fact.period, brand: fact.brand, units: fact.units, revenueRub: fact.revenueRub })),
    });
    return {
      aggregate,
      aggregateReady: aggregate.status === 'ready',
      sourceRows: snapshot.facts.length,
      dataVersion: snapshot.dataVersion,
      legacyData: snapshot.legacyData,
    };
  }
}
