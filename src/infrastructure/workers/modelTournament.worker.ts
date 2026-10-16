/// <reference lib="webworker" />
import { runModelTournament } from '../../application/services/modelTournamentService';
import type { TemporalDatasetResult } from '../../application/services/temporalModelDatasetService';
import type { TournamentCandidateId } from '../../application/services/modelTournamentCandidates';

interface Request { token: number; dataset: TemporalDatasetResult; config: { minTrainPeriods: number; testWindow: number; candidateIds: TournamentCandidateId[]; lambdas: number[] } }
declare const self: DedicatedWorkerGlobalScope;
self.onmessage = (event: MessageEvent<Request>) => {
  const { token, dataset, config } = event.data;
  try {
    const report = runModelTournament(dataset, { ...config, onProgress: (completed, total, candidateId) => self.postMessage({ type: 'progress', token, completed, total, candidateId }) });
    self.postMessage({ type: 'done', token, report });
  } catch (error) { self.postMessage({ type: 'error', token, message: error instanceof Error ? error.message : String(error) }); }
};
export {};
