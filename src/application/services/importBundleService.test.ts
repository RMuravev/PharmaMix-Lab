import { describe, expect, it, vi } from 'vitest';
import { ImportBundleService } from './importBundleService';
import type { UnifiedImportService } from './unifiedImportService';

describe('ImportBundleService', () => {
  it('rejects duplicate sources before writing anything', async () => {
    const imports = { importSource: vi.fn() } as unknown as UnifiedImportService;
    const service = new ImportBundleService(imports);
    const preview = service.preview({ projectId: 'p1', sources: [
      { sourceType: 'sales', rows: [{ period: '2026-01' }] },
      { sourceType: 'sales', rows: [{ period: '2026-02' }] },
    ] });
    expect(preview.valid).toBe(false);
    expect(preview.errors.some(error => error.includes('более одного раза'))).toBe(true);
    expect(imports.importSource).not.toHaveBeenCalled();
  });

  it('reports partial publication clearly when a later source fails', async () => {
    const imports = { importSource: vi.fn()
      .mockResolvedValueOnce({ projectId: 'p1', sourceType: 'sales', importedRows: 1 })
      .mockRejectedValueOnce(new Error('quota exceeded')) } as unknown as UnifiedImportService;
    const service = new ImportBundleService(imports);
    const result = await service.commit({ projectId: 'p1', batchId: 'b1', sources: [
      { sourceType: 'sales', rows: [{ id: 1 }] },
      { sourceType: 'market', rows: [{ id: 2 }] },
    ] });
    expect(result.status).toBe('partial');
    expect(result.completedSources).toEqual(['sales']);
    expect(result.failedSource).toBe('market');
    expect(result.atomicity).toBe('per-source-only');
  });

  it('rejects empty bundles', async () => {
    const service = new ImportBundleService({ importSource: vi.fn() } as unknown as UnifiedImportService);
    const result = await service.commit({ projectId: 'p1', sources: [] });
    expect(result.status).toBe('failed');
    expect(result.error).toContain('хотя бы один источник');
  });
});
