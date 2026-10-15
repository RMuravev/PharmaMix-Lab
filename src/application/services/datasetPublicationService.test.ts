import { describe, expect, it } from 'vitest';
import { DatasetPublicationService } from './datasetPublicationService';

describe('DatasetPublicationService validation', () => {
  it('rejects empty project id without opening IndexedDB', async () => {
    await expect(new DatasetPublicationService().create(' ')).rejects.toThrow('projectId обязателен');
  });
  it('rejects unknown expected sources before touching IndexedDB', async () => {
    await expect(new DatasetPublicationService().create('p1', ['sales', 'unknown'])).rejects.toThrow('корректный источник');
  });
  it('rejects invalid source versions before touching IndexedDB', async () => {
    await expect(new DatasetPublicationService().markSourcePrepared('v1', 'sales', -1)).rejects.toThrow('Некорректный источник');
    await expect(new DatasetPublicationService().markSourcePrepared('v1', 'unknown', 1)).rejects.toThrow('Некорректный источник');
  });
});
