/** Input-level OOS guard. Missing observations are not inferred as zero sales. */
export interface OOSPreflightRow { month: string; brand: string; salesRub: number }
export interface OOSPreflightResult { valid: boolean; errors: string[]; warnings: string[] }
const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
export function validateOOSPreflight(rows: OOSPreflightRow[], expectedMonths: string[]): OOSPreflightResult {
  const errors: string[] = [], warnings: string[] = [];
  if (!Array.isArray(rows) || !Array.isArray(expectedMonths) || expectedMonths.length === 0) {
    return { valid: false, errors: ['Не переданы наблюдения или тестовые месяцы.'], warnings };
  }
  if (new Set(expectedMonths).size !== expectedMonths.length || expectedMonths.some(m => !monthPattern.test(m))) {
    errors.push('Тестовое окно содержит дубли или некорректные месяцы.');
  }
  const brands = new Set<string>();
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row || typeof row.brand !== 'string' || !row.brand.trim() || !monthPattern.test(row.month)) {
      errors.push('Обнаружена запись без бренда или с некорректным месяцем.'); continue;
    }
    const key = JSON.stringify([row.brand.trim(), row.month]);
    if (seen.has(key)) errors.push(`Повтор бренда и месяца: ${row.brand} / ${row.month}.`);
    seen.add(key);
    brands.add(row.brand.trim());
    if (!Number.isFinite(row.salesRub) || row.salesRub <= 0) {
      errors.push(`Продажи ${row.brand} / ${row.month} не являются положительным конечным числом; запись нельзя молча исключать из log-MMM.`);
    }
  }
  if (brands.size === 0) errors.push('Нет ни одной серии бренда.');
  for (const brand of brands) for (const month of expectedMonths) {
    if (!seen.has(JSON.stringify([brand, month]))) errors.push(`Отсутствует наблюдение ${brand} / ${month}; ноль не подставляется автоматически.`);
  }
  if (expectedMonths.length < 3) warnings.push('Тестовый горизонт меньше трёх месяцев: оценка качества может быть нестабильной.');
  return { valid: errors.length === 0, errors, warnings };
}
