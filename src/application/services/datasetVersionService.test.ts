import { describe, expect, it } from 'vitest';
import { DatasetVersionService } from './datasetVersionService';

describe('DatasetVersionService input contract', () => {
  it('rejects missing identity/fingerprint before opening the database', async () => {
    const service = new DatasetVersionService();
    await expect(service.publish('', 'sales', 'abc')).rejects.toThrow('обязательны');
    await expect(service.publish('p1', 'sales', '')).rejects.toThrow('обязательны');
  });
});
