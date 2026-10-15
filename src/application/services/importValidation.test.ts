import { describe, expect, it } from 'vitest';
import { validateImportPartitions } from './importValidation';

describe('validateImportPartitions', () => {
  it('accepts object rows and counts records', () => {
    const result = validateImportPartitions({ sales: [{ id: 1 }, { id: 2 }], promos: [{ id: 3 }] }, 'batch-1');
    expect(result.valid).toBe(true);
    expect(result.totalRows).toBe(3);
    expect(result.partitions.sales).toBe(2);
  });
  it('rejects primitive rows and empty imports', () => {
    expect(validateImportPartitions({ sales: [null] }, 'batch-2').valid).toBe(false);
    expect(validateImportPartitions({}, 'batch-3').errors).toContain('Импорт не содержит ни одной записи.');
  });
  it('warns when sales and market data are absent', () => {
    const result = validateImportPartitions({ promos: [{ id: 1 }] }, 'batch-4');
    expect(result.warnings.some(warning => warning.includes('Нет продаж'))).toBe(true);
  });
});
