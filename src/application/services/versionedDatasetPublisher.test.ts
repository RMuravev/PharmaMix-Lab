import { describe, expect, it } from 'vitest';
import { VersionedDatasetPublisher, type VersionedDatasetInput } from './versionedDatasetPublisher';

const emptySnapshot = (): VersionedDatasetInput => ({
  salesFacts: [], marketFacts: [], promoFacts: [], tvFacts: [], visitFacts: [],
});
const fact = (id: string, projectId = 'p1') => ({ id, projectId, datasetVersion: 'incoming' });

describe('versioned dataset publication contract', () => {
  it('requires an explicit entry for each of the five sources', async () => {
    const publisher = new VersionedDatasetPublisher();
    const incomplete = { ...emptySnapshot() } as Partial<VersionedDatasetInput>;
    delete incomplete.tvFacts;
    await expect(publisher.publish('p1', incomplete as VersionedDatasetInput)).rejects.toThrow('tvFacts');
  });

  it('rejects facts belonging to another project before opening IndexedDB', async () => {
    const input = emptySnapshot();
    input.salesFacts = [fact('s1', 'different-project')];
    await expect(new VersionedDatasetPublisher().publish('p1', input)).rejects.toThrow('projectId');
  });

  it('rejects duplicate source identifiers before opening IndexedDB', async () => {
    const input = emptySnapshot();
    input.salesFacts = [fact('same'), fact('same')];
    await expect(new VersionedDatasetPublisher().publish('p1', input)).rejects.toThrow('Дублирующийся id');
  });

  it('allows intentionally empty sources when other sources contain facts', () => {
    const snapshot = emptySnapshot();
    snapshot.salesFacts = [fact('s1')];
    expect(Object.keys(snapshot)).toHaveLength(5);
    expect(snapshot.tvFacts).toEqual([]);
  });
});
