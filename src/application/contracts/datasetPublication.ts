export type DatasetPublicationStatus = 'building' | 'ready' | 'active' | 'superseded' | 'failed';

export interface DatasetPublication {
  id: string;
  projectId: string;
  version: number;
  status: DatasetPublicationStatus;
  sourceVersions: Partial<Record<'sales' | 'market' | 'promo' | 'tv' | 'visits', number>>;
  expectedSources: string[];
  preparedSources: string[];
  createdAt: string;
  updatedAt: string;
  activatedAt?: string;
  error?: string;
}

export interface ProjectDatasetPointer {
  id: string;
  activeDatasetVersion?: string;
  updatedAt: string;
  schemaVersion: number;
}
