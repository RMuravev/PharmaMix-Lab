import { describe, expect, it } from 'vitest';
import { assertScenarioDatasetVersion } from './scenarioResultPersistenceService';

describe('assertScenarioDatasetVersion', () => {
  it('accepts the version used by the scenario calculation', () => {
    expect(() => assertScenarioDatasetVersion('dataset-4', 'dataset-4')).not.toThrow();
  });

  it('rejects saving when the active version changed during calculation', () => {
    expect(() => assertScenarioDatasetVersion('dataset-3', 'dataset-4')).toThrow(/Перезапустите сценарий/);
  });

  it('rejects an empty expected version', () => {
    expect(() => assertScenarioDatasetVersion('', 'dataset-4')).toThrow(/expectedDatasetVersion/);
  });

  it('rejects a project without an active dataset version', () => {
    expect(() => assertScenarioDatasetVersion('dataset-4', null)).toThrow(/Нет активной версии/);
  });
});
