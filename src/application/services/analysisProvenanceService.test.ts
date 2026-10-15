import { describe, expect, it } from 'vitest';
import { assertCurrentAnalysis, classifyAnalysisProvenance } from './analysisProvenanceService';

const base = { projectId: 'p', datasetVersion: 'v2', algorithmVersion: 'promo-v1', createdAt: '2026-10-15T10:00:00Z', coverage: { observed: 8, expected: 10 } };
describe('analysis provenance', () => {
  it('accepts current, complete results and reports coverage', () => expect(classifyAnalysisProvenance(base, 'p', 'v2')).toMatchObject({ freshness: 'fresh', coveragePct: 80 }));
  it('blocks stale, cross-project and incomplete results', () => {
    expect(classifyAnalysisProvenance({ ...base, datasetVersion: 'v1' }, 'p', 'v2').freshness).toBe('stale');
    expect(classifyAnalysisProvenance(base, 'other', 'v2').freshness).toBe('unverifiable');
    expect(classifyAnalysisProvenance({ ...base, algorithmVersion: null }, 'p', 'v2').freshness).toBe('unverifiable');
  });
  it('rejects invalid coverage and throws on non-current results', () => {
    expect(classifyAnalysisProvenance({ ...base, coverage: { observed: 11, expected: 10 } }, 'p', 'v2').freshness).toBe('unverifiable');
    expect(() => assertCurrentAnalysis({ ...base, datasetVersion: 'v1' }, 'p', 'v2')).toThrow(/заблокирован/);
  });
});
