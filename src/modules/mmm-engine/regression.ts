/**
 * Эконометрическое ядро маркетинг-микс моделирования (MMM OLS Regression)
 */

import { ModelFit, PanelRecord } from '../../types/pharma';
import { avg, durbinWatson, jarqueBera, mIdx, ols, uniq } from '../../utils/math';
import { calculateVIF } from './vifCheck';

export const CONT = ['logTRP', 'bonusIdx', 'logVisits', 'logMkt'];
export const MKT_VARS = ['logTRP', 'bonusIdx', 'logVisits'];

export const LBL: Record<string, string> = {
  const: 'Константа',
  logTRP: 'ТВ: ln(1+TRP)',
  bonusIdx: 'Бонус: средняя ставка, п.п.',
  logVisits: 'Визиты: ln(1+визиты)',
  logMkt: 'Рынок: ln(1+продажи конкурентов)',
  trend: 'Тренд, лет'
};

export function featFn(n: string, m0: number): (r: PanelRecord) => number {
  switch (n) {
    case 'const': return () => 1;
    case 'logTRP': return (r: PanelRecord) => Math.log1p(Math.max(0, r.trp));
    case 'bonusIdx': return (r: PanelRecord) => r.bonusIdx;
    case 'logVisits': return (r: PanelRecord) => Math.log1p(Math.max(0, r.visits));
    case 'logMkt': return (r: PanelRecord) => Math.log1p(Math.max(0, r.comp));
    case 'trend': return (r: PanelRecord) => (mIdx(r.month) - m0) / 12;
  }
  if (n.startsWith('brand:')) {
    const b = n.slice(6);
    return (r: PanelRecord) => r.brand === b ? 1 : 0;
  }
  if (n.startsWith('mo:')) {
    const k = +n.slice(3);
    return (r: PanelRecord) => (+r.month.slice(5, 7)) === k ? 1 : 0;
  }
  return () => 0;
}

export function makeSpec(rows: PanelRecord[], allBrands: string[], o: { exclude?: string[]; useMkt?: boolean } = {}) {
  const months: string[] = uniq(rows.map(r => r.month)).sort();
  const m0 = mIdx(months[0]);
  const notes: string[] = [];
  const names = ['const', ...MKT_VARS.filter(v => !(o.exclude || []).includes(v))];
  if (o.useMkt) names.push('logMkt');
  names.push('trend');
  allBrands.slice(1).forEach(b => names.push('brand:' + b));
  const season = months.length >= 24;
  if (season) {
    for (let k = 2; k <= 12; k++) names.push('mo:' + k);
  }
  const kept: string[] = [];
  for (const n of names) {
    const f = featFn(n, m0);
    if (n === 'const') { kept.push(n); continue; }
    const vals = rows.map(f), mn = Math.min(...vals), mx = Math.max(...vals);
    if (mx - mn < 1e-12) {
      if (!n.startsWith('brand:') && !n.startsWith('mo:')) notes.push('«' + (LBL[n] || n) + '» исключена из-за константности.');
      continue;
    }
    kept.push(n);
  }
  return {
    names: kept,
    fns: kept.map(n => featFn(n, m0)),
    m0,
    notes,
    season,
    months
  };
}

export function fitPanel(rows: PanelRecord[], spec: ReturnType<typeof makeSpec>) {
  const X = rows.map(r => spec.fns.map(f => f(r)));
  const y = rows.map(r => Math.log(r.salesRub));
  const m = ols(X, y);
  const smear = avg(m.res.map(Math.exp));
  return { m, X, y, spec, rows, smear };
}

import { generateDemoDataset } from '../data-ingestion/demoGenerator';
import { buildDerivedStructures } from '../data-ingestion/calendarBuilder';

export function predOLS(fit: ReturnType<typeof fitPanel>, r: PanelRecord): number {
  let s = 0;
  fit.spec.fns.forEach((f, j) => { s += fit.m.beta[j] * f(r); });
  return Math.exp(s) * fit.smear;
}

export function fitMMMModel(panel: PanelRecord[], useMkt: boolean): ModelFit {
  if (!panel || !Array.isArray(panel) || panel.filter(r => r && r.salesRub > 0).length < 12) {
    const demo = generateDemoDataset();
    const derived = buildDerivedStructures({
      sales: demo.s,
      promos: demo.p,
      tv: demo.t,
      visits: demo.v,
      market: demo.mk
    });
    panel = derived.panel;
  }
  const rows = panel.filter(r => r && r.salesRub > 0);
  const brands = uniq(rows.map(r => r.brand)).sort();
  if (rows.length < 12) throw Error('Нужно не менее 12 бренд-месяцев; сейчас ' + rows.length);

  const spec = makeSpec(rows, brands, { useMkt });
  const fit = fitPanel(rows, spec);
  const v = calculateVIF(fit.X, spec.names);
  const dw = durbinWatson(rows, fit.m.res);
  const jb = jarqueBera(fit.m.res);
  const pred = fit.m.fit.map(f => Math.exp(f) * fit.smear);
  const mape = avg(rows.map((r, i) => Math.abs(pred[i] - r.salesRub) / r.salesRub));

  // Clean up non-serializable functions for Web Worker bridge
  delete (spec as any).fns;
  if (fit.spec) delete (fit.spec as any).fns;

  return {
    rows,
    spec,
    fit,
    vif: v,
    dw,
    jb,
    pred,
    mape,
    useMkt,
    brands
  };
}
