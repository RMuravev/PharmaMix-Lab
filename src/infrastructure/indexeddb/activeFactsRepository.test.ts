import { describe, expect, it } from 'vitest';
import type { VersionedFact } from '../../application/contracts/versionedFacts';

describe('versioned fact contract', () => {
  it('requires project and dataset version on every published fact', () => {
    const fact: VersionedFact = { id: 'f1', projectId: 'p1', datasetVersion: 'p1:dataset:2' };
    expect(fact.projectId).toBe('p1');
    expect(fact.datasetVersion).toBe('p1:dataset:2');
  });
});
