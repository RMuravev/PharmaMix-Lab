/**
 * Финансовая оценка промо-кампаний, агрегация показателей и рыночные метрики
 */

import { AggregatedFinGroup, PromoAtom, RawMarketRow } from '../../types/pharma';
import { SEP, avg, pct, sum, tInv, uniq, mAdd } from '../../utils/math';

export function fin(g: AggregatedFinGroup, margin: number): AggregatedFinGroup {
  g.n = g.ids.size;
  g.nv = g.vids.size;
  g.dU = g.actUV - g.baseU;
  g.dR = g.actRV - g.baseR;
  g.uplift = g.baseR > 0 ? g.dR / g.baseR : NaN;
  g.roas = g.bonusV > 0 ? g.dR / g.bonusV : NaN;
  g.be = g.dR > 0 ? g.bonusV / g.dR : NaN;
  g.profit = Number.isFinite(margin) ? g.dR * margin - g.bonusV : NaN;
  g.roi = Number.isFinite(g.profit) && g.bonusV > 0 ? (g.profit! / g.bonusV) : NaN;
  g.cov = g.n ? g.nv / g.n : NaN;
  return g;
}

export function aggregate(
  atoms: PromoAtom[],
  dims: string[],
  margin: number,
  pred?: (a: PromoAtom) => boolean
): AggregatedFinGroup[] {
  const mp = new Map<string, AggregatedFinGroup>();
  for (const a of atoms) {
    if (pred && !pred(a)) continue;
    const k = dims.length ? dims.map(d => (a as any)[d]).join(SEP) : '*';
    let g = mp.get(k);
    if (!g) {
      g = {
        dims: dims.map(d => (a as any)[d]),
        ids: new Set(),
        vids: new Set(),
        actU: 0,
        actR: 0,
        actUV: 0,
        actRV: 0,
        baseU: 0,
        baseR: 0,
        bonus: 0,
        bonusV: 0
      };
      mp.set(k, g);
    }
    g.ids.add(a.fid);
    if (a.valid) g.vids.add(a.fid);
    g.actU += a.actU;
    g.actR += a.actR;
    g.actUV += a.actUV;
    g.actRV += a.actRV;
    g.baseU += a.baseU;
    g.baseR += a.baseR;
    g.bonus += a.bonus;
    g.bonusV += a.bonusV;
  }
  const out = [...mp.values()];
  out.forEach(g => fin(g, margin));
  if (!dims.length && !out.length) {
    out.push(fin({
      dims: [],
      ids: new Set(),
      vids: new Set(),
      actU: 0,
      actR: 0,
      actUV: 0,
      actRV: 0,
      baseU: 0,
      baseR: 0,
      bonus: 0,
      bonusV: 0
    }, margin));
  }
  return out;
}

export function mechStats(atoms: PromoAtom[]): Map<string, { n: number; mean: number; lo: number; hi: number; pos: number }> {
  const acts = new Map<string, { mech: string; act: number; base: number }>();
  for (const a of atoms) {
    if (!a.valid) continue;
    const k = [a.mech, a.month, a.chain, a.brand, a.sku].join(SEP);
    let g = acts.get(k);
    if (!g) { g = { mech: a.mech, act: 0, base: 0 }; acts.set(k, g); }
    g.act += a.actR;
    g.base += a.baseR;
  }
  const by = new Map<string, number[]>();
  for (const g of acts.values()) {
    if (!(g.base > 0)) continue;
    if (!by.has(g.mech)) by.set(g.mech, []);
    by.get(g.mech)!.push((g.act - g.base) / g.base);
  }
  const res = new Map<string, { n: number; mean: number; lo: number; hi: number; pos: number }>();
  for (const [m, u] of by) {
    const n = u.length, mean = avg(u);
    const sd = n > 1 ? Math.sqrt(u.reduce((s: number, v: number) => s + (v - mean) ** 2, 0) / (n - 1)) : NaN;
    const h = n > 2 ? tInv(n - 1) * sd / Math.sqrt(n) : NaN;
    res.set(m, {
      n,
      mean,
      lo: mean - h,
      hi: mean + h,
      pos: u.filter((v: number) => v > 0).length / n
    });
  }
  return res;
}

export function mechVerdict(g: AggregatedFinGroup, st: any, margin: number): string {
  if (!st || st.n < 5) return 'Мало наблюдений (<5 акций) — вывод не делаем';
  if (st.lo <= 0 && st.hi >= 0) return 'Аплифт статистически не отличим от нуля';
  if (st.hi < 0) return 'Отрицательный аплифт — вероятен сдвиг спроса';
  if ((g.be || 0) > 1) return 'Аплифт есть, но бонус превышает прирост выручки';
  if (Number.isFinite(margin)) {
    return (g.roi || 0) > 0
      ? 'Положительный аплифт, окупается при марже ' + pct(margin, 0)
      : 'Аплифт есть, но не окупает бонусы';
  }
  return 'Положительный аплифт; безубыточная маржа ≥ ' + pct(g.be || 0, 0);
}

export function marketCalc(
  marketRows: RawMarketRow[],
  mkt: string,
  reg: string,
  metric: string,
  W: number,
  ownBrands: Set<string>
) {
  const rows = marketRows.filter(r => r.market === mkt && (!reg || r.region === reg));
  const months: string[] = uniq(rows.map(r => r.month)).sort();
  if (!months.length) return null;

  const val = (r: RawMarketRow) => metric === 'units' ? r.units : r.salesRub;
  const bm = new Map<string, number>(), bmR = new Map<string, number>(), bmU = new Map<string, number>(), tot = new Map<string, number>();

  for (const r of rows) {
    const k = r.brand + SEP + r.month;
    bm.set(k, (bm.get(k) || 0) + val(r));
    bmR.set(k, (bmR.get(k) || 0) + r.salesRub);
    bmU.set(k, (bmU.get(k) || 0) + r.units);
    tot.set(r.month, (tot.get(r.month) || 0) + val(r));
  }

  const brands: string[] = uniq(rows.map(r => r.brand));
  const w = Math.min(W, Math.floor(months.length / 2) || 1);
  const cur: string[] = months.slice(-w);
  const prev: string[] = cur.map(m => mAdd(m, -w));
  const yoy: string[] = cur.map(m => mAdd(m, -12));

  const S_ = (map: Map<string, number>, b: string, ms: string[]) => sum(ms, (m: string) => map.get(b + SEP + m) || 0);
  const T_ = (ms: string[]) => sum(ms, (m: string) => tot.get(m) || 0);
  const tc = T_(cur), tp = T_(prev), ty = T_(yoy);

  const list = brands.map(b => {
    const c = S_(bm, b, cur), p = S_(bm, b, prev), y = S_(bm, b, yoy);
    const cr = S_(bmR, b, cur), cu = S_(bmU, b, cur), pr = S_(bmR, b, prev), pu = S_(bmU, b, prev);
    const price = cu > 0 ? cr / cu : NaN, pprice = pu > 0 ? pr / pu : NaN;
    return {
      brand: b,
      own: ownBrands.has(b),
      cur: c,
      prev: p,
      yoy: y,
      share: tc > 0 ? c / tc : NaN,
      sharePrev: tp > 0 ? p / tp : NaN,
      shareYoy: ty > 0 ? y / ty : NaN,
      dShare: (tc > 0 && tp > 0) ? c / tc - p / tp : NaN,
      dShareYoy: (tc > 0 && ty > 0) ? c / tc - y / ty : NaN,
      g: p > 0 ? c / p - 1 : NaN,
      gYoy: y > 0 ? c / y - 1 : NaN,
      price,
      dPrice: pprice > 0 ? price / pprice - 1 : NaN
    };
  }).sort((a, b) => b.cur - a.cur);

  const series = list.slice(0, 8).map(x => ({
    name: x.brand,
    values: months.map(m => (tot.get(m)! > 0) ? (bm.get(x.brand + SEP + m) || 0) / tot.get(m)! : NaN)
  }));

  return {
    months,
    list,
    series,
    tc,
    tp,
    ty,
    w,
    cur,
    prev,
    yoy,
    mg: tp > 0 ? tc / tp - 1 : NaN,
    mgYoy: ty > 0 ? tc / ty - 1 : NaN,
    shareSum: sum(list, 'share')
  };
}
