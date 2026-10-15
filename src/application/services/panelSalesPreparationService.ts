/** Prepare fine-grain pharmacy sales without erasing region/chain identity.
 * This is a staging utility, NOT a replacement for the legacy brand-month MMM panel.
 */
export interface FineSalesRow {
  month: string;
  brand: string;
  region: string;
  chain: string;
  sku: string;
  units: number;
  salesRub: number;
}
export interface PreparedPanelRow {
  month: string;
  brand: string;
  region: string;
  chain: string;
  units: number;
  salesRub: number;
  skuCount: number;
}
export interface PanelPreparationResult {
  valid: boolean;
  panels: PreparedPanelRow[];
  errors: string[];
  warnings: string[];
  panelCount: number;
}
const monthRe = /^\d{4}-(0[1-9]|1[0-2])$/;
const fields = ['brand', 'region', 'chain', 'sku'] as const;
const key = (parts: string[]) => JSON.stringify(parts);

/** Duplicate SKU rows are rejected, not silently summed (may indicate a duplicated upload). */
export function preparePanelSales(
  rows: FineSalesRow[],
  options: { expectedMonths?: string[]; requirePositiveSalesForLogModel?: boolean } = {},
): PanelPreparationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const panels = new Map<string, PreparedPanelRow & { skuSet: Set<string> }>();
  const seen = new Set<string>();
  if (!Array.isArray(rows) || rows.length === 0) errors.push('Не переданы строки аптечных продаж.');
  const expected = options.expectedMonths;
  if (expected && (new Set(expected).size !== expected.length || expected.some(m => !monthRe.test(m)))) {
    errors.push('Ожидаемые месяцы содержат дубли или некорректные даты.');
  }
  for (const [i, row] of (Array.isArray(rows) ? rows : []).entries()) {
    if (!row || !monthRe.test(row.month) || fields.some(f => typeof row[f] !== 'string' || !row[f].trim())) {
      errors.push(`Строка ${i + 1}: некорректный месяц или пустая размерность.`);
      continue;
    }
    if (!Number.isFinite(row.units) || !Number.isFinite(row.salesRub) || row.units < 0 || row.salesRub < 0) {
      errors.push(`Строка ${i + 1}: продажи должны быть конечными неотрицательными числами.`);
      continue;
    }
    const dimensions = [row.brand.trim(), row.region.trim(), row.chain.trim()];
    const uniqueKey = key([row.month, ...dimensions, row.sku.trim()]);
    if (seen.has(uniqueKey)) {
      errors.push(`Строка ${i + 1}: повтор SKU в том же месяце, бренде, регионе и сети.`);
      continue;
    }
    seen.add(uniqueKey);
    const panelKey = key([row.month, ...dimensions]);
    let panel = panels.get(panelKey);
    if (!panel) {
      panel = { month: row.month, brand: dimensions[0], region: dimensions[1], chain: dimensions[2],
        units: 0, salesRub: 0, skuCount: 0, skuSet: new Set() };
      panels.set(panelKey, panel);
    }
    panel.units += row.units;
    panel.salesRub += row.salesRub;
    panel.skuSet.add(row.sku.trim());
    panel.skuCount = panel.skuSet.size;
    if (!Number.isFinite(panel.units) || !Number.isFinite(panel.salesRub)) errors.push(`Переполнение при агрегации строки ${i + 1}.`);
  }
  const result = [...panels.values()].map(({ skuSet: _skuSet, ...panel }) => panel)
    .sort((a, b) => key([a.brand, a.region, a.chain, a.month]).localeCompare(key([b.brand, b.region, b.chain, b.month])));
  const series = new Map<string, Set<string>>();
  for (const panel of result) {
    const id = key([panel.brand, panel.region, panel.chain]);
    if (!series.has(id)) series.set(id, new Set());
    series.get(id)!.add(panel.month);
    if (options.requirePositiveSalesForLogModel && panel.salesRub <= 0) {
      errors.push(`Нулевые продажи для log-MMM: ${panel.brand} / ${panel.region} / ${panel.chain} / ${panel.month}.`);
    }
  }
  if (expected && expected.every(m => monthRe.test(m))) {
    for (const [id, months] of series) for (const month of expected) {
      if (!months.has(month)) errors.push(`Нет месяца ${month} для панели ${id}; нули не подставлены.`);
    }
  }
  if (series.size > 1) warnings.push('Панели разделены по бренд × регион × сеть. Для HAC нельзя объединять их остатки в один временной ряд.');
  return { valid: errors.length === 0, panels: result, errors, warnings, panelCount: series.size };
}
