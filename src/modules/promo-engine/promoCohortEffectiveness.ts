import { RawPromoRow, RawSalesRow } from '../../types/pharma';

export interface PromoCohortMetric {
  cohort: string;
  mechanic: string;
  observations: number;
  salesRub: number;
  bonusRub: number;
  meanSalesRub: number;
  meanSalesCi: [number, number] | null;
  roas: number | null;
  coveragePct: number;
  warnings: string[];
}

function key(p: Pick<RawPromoRow, 'month'|'chain'|'brand'|'sku'>): string {
  return `${p.month}\u001f${p.chain}\u001f${p.brand}\u001f${p.sku}`;
}

function quantile(values: number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return NaN;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))];
}

/** Descriptive cohort/mechanic metrics; intervals are bootstrap uncertainty, not causal effects. */
export function summarizePromoCohorts(sales: RawSalesRow[], promos: RawPromoRow[], reps = 1000, blockedKeys: string[] = []): PromoCohortMetric[] {
  if (!Number.isInteger(reps) || reps <= 0) throw new Error('reps должен быть положительным целым числом.');
  const salesByKey = new Map<string, number>();
  for (const row of sales) {
    if (Number.isFinite(row.salesRub) && row.salesRub >= 0) salesByKey.set(key(row), (salesByKey.get(key(row)) || 0) + row.salesRub);
  }
  const counts = new Map<string, number>();
  for (const p of promos) counts.set(key(p), (counts.get(key(p)) || 0) + 1);
  const groups = new Map<string, { values: number[]; sales: number; bonus: number; rates: number[]; matched: number; total: number }>();
  for (const p of promos) {
    const k = key(p);
    const cohort = p.month;
    const mechanic = p.mechanic || 'Не указана';
    const gk = `${cohort}\u001f${mechanic}`;
    const g = groups.get(gk) || { values: [], sales: 0, bonus: 0, rates: [], matched: 0, total: 0 };
    g.total++;
    if (blockedKeys.includes(k) || counts.get(k)! > 1 || !Number.isFinite(p.bonusPct) || p.bonusPct < 0) { groups.set(gk, g); continue; }
    const revenue = salesByKey.get(k);
    if (revenue === undefined) { groups.set(gk, g); continue; }
    const bonus = revenue * p.bonusPct / 100;
    g.values.push(revenue); g.sales += revenue; g.bonus += bonus; g.rates.push(p.bonusPct); g.matched++;
    groups.set(gk, g);
  }
  return [...groups.entries()].map(([gk, g]) => {
    const [cohort, mechanic] = gk.split('\u001f');
    const mean = g.values.length ? g.sales / g.values.length : NaN;
    let ci: [number, number] | null = null;
    if (g.values.length >= 2) {
      const draws: number[] = [];
      const n = g.values.length;
      const exactCount = n <= 4 ? n ** n : 0;
      if (exactCount) {
        for (let code = 0; code < exactCount; code++) { let x = code, total = 0; for (let i = 0; i < n; i++) { total += g.values[x % n]; x = Math.floor(x / n); } draws.push(total / n); }
      } else {
        let state = 0x9e3779b9;
        const random = () => { state = Math.imul(state ^ (state >>> 16), 2246822519); state = Math.imul(state ^ (state >>> 13), 3266489917); return ((state ^ (state >>> 16)) >>> 0) / 4294967296; };
        for (let r = 0; r < reps; r++) { let total = 0; for (let i = 0; i < n; i++) total += g.values[Math.floor(random() * n)]; draws.push(total / n); }
      }
      ci = [quantile(draws, 0.025), quantile(draws, 0.975)];
    }
    const warnings: string[] = [];
    if (g.values.length < 5) warnings.push('Мало наблюдений (<5): интервал нестабилен.');
    if (g.total > g.matched) warnings.push(`Покрытие продажами ${Math.round(100 * g.matched / g.total)}%; unmatched/duplicate строки исключены.`);
    warnings.push('Описательная метрика; CI не доказывает причинность.');
    return { cohort, mechanic, observations: g.matched, salesRub: g.sales, bonusRub: g.bonus, meanSalesRub: mean, meanSalesCi: ci, roas: g.bonus > 0 ? g.sales / g.bonus : null, coveragePct: g.total ? 100 * g.matched / g.total : 0, warnings };
  }).sort((a, b) => a.cohort.localeCompare(b.cohort) || a.mechanic.localeCompare(b.mechanic));
}
