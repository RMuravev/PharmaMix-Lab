import { describe, expect, it } from 'vitest';
import { parseCsv } from './SalesImportPage';

describe('parseCsv', () => {
  it('parses headers, CRLF, quoted commas and escaped quotes', () => {
    const rows = parseCsv('Бренд,SKU,Комментарий\r\n"Бренд, А",001,"сказал ""да"""\r\n');
    expect(rows).toEqual([{ 'Бренд': 'Бренд, А', SKU: '001', 'Комментарий': 'сказал "да"' }]);
  });
  it('removes BOM and skips empty lines', () => {
    expect(parseCsv('\uFEFFbrand,sku\nA,1\n\nB,2\n')).toHaveLength(2);
  });
  it('rejects duplicate headers and uneven rows', () => {
    expect(() => parseCsv('brand,brand\na,b')).toThrow('повторяющиеся');
    expect(() => parseCsv('brand,sku\na')).toThrow('число значений');
  });
  it('rejects unterminated quoted cells', () => {
    expect(() => parseCsv('brand,sku\n"A,1')).toThrow('незакрытую кавычку');
  });
});
