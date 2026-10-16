import { ModelRunPersistenceService, type PersistedModelRunSummary } from './modelRunPersistenceService';
import type { ModelTournamentReport } from './modelTournamentService';
import type { TournamentCandidateId } from './modelTournamentCandidates';

export interface TournamentProvenance { projectId: string; datasetVersion: string; brand: string; featureNames: readonly string[]; candidateIds: readonly TournamentCandidateId[]; minTrainPeriods: number; testWindow: number; lambdas: readonly number[] }
export async function persistModelTournament(report: ModelTournamentReport, provenance: TournamentProvenance): Promise<PersistedModelRunSummary> {
  if (!provenance.brand.trim() || !provenance.datasetVersion.trim()) throw new Error('Tournament provenance requires brand and active dataset version.');
  return new ModelRunPersistenceService().persist({ projectId: provenance.projectId, modelType: 'model-tournament', algorithmVersion: report.algorithmVersion, expectedDatasetVersion: provenance.datasetVersion, parameters: { brand: provenance.brand, featureNames: provenance.featureNames, candidateIds: provenance.candidateIds, minTrainPeriods: provenance.minTrainPeriods, testWindow: provenance.testWindow, lambdas: provenance.lambdas }, results: [{ resultType: 'model-tournament-report', payload: report }] });
}
