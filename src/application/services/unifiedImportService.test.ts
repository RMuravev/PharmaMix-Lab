import { describe, expect, it, vi } from 'vitest';
import { UnifiedImportService, type ImportSourceHandler } from './unifiedImportService';

describe('UnifiedImportService', () => {
  const report = { importedRows: 2, skippedRows: 0, issues: [], datasetVersion: 1, fingerprint: 'abc' };

  it('dispatches the chosen source and returns project/source metadata', async () => {
    const commit = vi.fn().mockResolvedValue(report);
    const handler: ImportSourceHandler = { commit };
    const service = new UnifiedImportService({ market: handler });
    const result = await service.importSource({ projectId: 'p1', sourceType: 'market', rows: [{}, {}], sourceBatchId: 'batch-1' });
    expect(commit).toHaveBeenCalledWith({ projectId: 'p1', sourceType: 'market', rows: [{}, {}], sourceBatchId: 'batch-1' });
    expect(result).toMatchObject({ projectId: 'p1', sourceType: 'market', sourceBatchId: 'batch-1', importedRows: 2, datasetVersion: 1 });
    expect(result.completedAt).toBeTruthy();
  });

  it('rejects an empty project and an empty file before dispatch', async () => {
    const commit = vi.fn().mockResolvedValue(report);
    const service = new UnifiedImportService({ sales: { commit } });
    await expect(service.importSource({ projectId: ' ', sourceType: 'sales', rows: [{}] })).rejects.toThrow('выбрать проект');
    await expect(service.importSource({ projectId: 'p1', sourceType: 'sales', rows: [] })).rejects.toThrow('не содержит строк');
    expect(commit).not.toHaveBeenCalled();
  });

  it('propagates source commit failures instead of reporting false success', async () => {
    const service = new UnifiedImportService({ promo: { commit: vi.fn().mockRejectedValue(new Error('quota exceeded')) } });
    await expect(service.importSource({ projectId: 'p1', sourceType: 'promo', rows: [{ sku: 'x' }] })).rejects.toThrow('quota exceeded');
  });
});
