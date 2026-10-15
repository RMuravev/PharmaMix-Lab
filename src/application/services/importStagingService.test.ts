import { describe, expect, it } from 'vitest';
import { ImportStagingService } from './importStagingService';

describe('ImportStagingService preview', () => {
  const service = new ImportStagingService();
  it('accepts a valid multi-source bundle and reports row counts', () => {
    const result = service.preview({ projectId: 'project-a', sources: [
      { sourceType: 'sales', rows: [{ period: '2026-01' }, { period: '2026-02' }] },
      { sourceType: 'market', rows: [{ period: '2026-01' }] },
    ], batchId: 'batch-a' });
    expect(result.valid).toBe(true);
    expect(result.totalRows).toBe(3);
    expect(result.sourceCount).toBe(2);
  });
  it('rejects duplicate source types before staging', () => {
    const result = service.preview({ projectId: 'project-a', sources: [
      { sourceType: 'sales', rows: [{ id: 1 }] },
      { sourceType: 'sales', rows: [{ id: 2 }] },
    ], batchId: 'batch-b' });
    expect(result.valid).toBe(false);
    expect(result.errors.some(error => error.includes('добавлен более одного раза'))).toBe(true);
  });

  it('uses the supplied batch id as a stable idempotency key', () => {
    const first = service.preview({ projectId: 'project-a', sources: [
      { sourceType: 'sales', rows: [{ id: 1 }] },
    ], batchId: 'stable-batch' });
    const retry = service.preview({ projectId: 'project-a', sources: [
      { sourceType: 'sales', rows: [{ id: 2 }] },
    ], batchId: 'stable-batch' });
    expect(first.batchId).toBe(retry.batchId);
    // Persistence layer rejects the second stage for this ID; preview remains pure.
    expect(first.valid && retry.valid).toBe(true);
  });
  it('rejects an empty project id', () => {
    const result = service.preview({ projectId: ' ', sources: [{ sourceType: 'sales', rows: [{ id: 1 }] }] });
    expect(result.valid).toBe(false);
  });
});
