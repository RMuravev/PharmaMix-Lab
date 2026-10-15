import type { ImportPreview } from '../contracts/import';
import type { LegacyStoreName } from '../../infrastructure/indexeddb/schema';

const SUPPORTED: readonly LegacyStoreName[] = ['sales', 'promos', 'tv', 'visits', 'market'];
function isObjectRow(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Lightweight envelope validation. Domain-specific column validation remains in data-quality services. */
export function validateImportPartitions(
  partitions: Partial<Record<LegacyStoreName, unknown[]>>,
  batchId: string,
  sourceFormat: ImportPreview['sourceFormat'] = 'legacy-dump',
): ImportPreview {
  const errors: string[] = [];
  const warnings: string[] = [];
  const counts: Partial<Record<LegacyStoreName, number>> = {};
  let totalRows = 0;
  for (const key of Object.keys(partitions)) {
    if (!SUPPORTED.includes(key as LegacyStoreName)) { errors.push(`Неподдерживаемый раздел: ${key}`); continue; }
    const rows = partitions[key as LegacyStoreName];
    if (!Array.isArray(rows)) { errors.push(`Раздел ${key}: ожидался массив записей.`); continue; }
    counts[key as LegacyStoreName] = rows.length;
    totalRows += rows.length;
    const invalidRow = rows.findIndex(row => !isObjectRow(row));
    if (invalidRow >= 0) errors.push(`Раздел ${key}: запись ${invalidRow + 1} должна быть объектом.`);
    if (rows.length === 0) warnings.push(`Раздел ${key} пуст.`);
  }
  if (totalRows === 0) errors.push('Импорт не содержит ни одной записи.');
  if (!partitions.sales && !partitions.market) warnings.push('Нет продаж или рыночных данных; аналитические результаты могут быть ограничены.');
  return { batchId, sourceFormat, partitions: counts, totalRows, warnings, errors, valid: errors.length === 0 };
}
