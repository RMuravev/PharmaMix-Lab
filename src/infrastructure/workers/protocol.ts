export type WorkerTaskType = 'aggregate' | 'mmm' | 'automl' | 'forecast' | 'causal' | 'optimize';

export type WorkerRequest = {
  id: string;
  type: WorkerTaskType;
  payload: unknown;
  datasetVersion: string;
  algorithmVersion: string;
};

export type WorkerResponse<T = unknown> =
  | { id: string; type: 'progress'; progress: number; message?: string }
  | { id: string; type: 'success'; result: T }
  | { id: string; type: 'error'; error: { code: string; message: string } };
