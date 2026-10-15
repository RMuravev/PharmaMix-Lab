/**
 * Построение непрерывного календарного грида и нормализованных панельных структур
 * Гарантирует корректный учет пробелов в продажах (месяца с 0 продаж) и отсутствия промо/визитов
 */

import {
  RawSalesRow,
  RawPromoRow,
  RawTVRow,
  RawVisitRow,
  RawMarketRow,
  DerivedStructures,
  SettingsConfig,
  SalesFineEntry,
  PanelRecord
} from '../../types/pharma';
import { SEP, sum, avg, uniq, mAdd } from '../../utils/math';
import { preparePanelSales } from '../../application/services/panelSalesPreparationService';

export const fkey = (x: any): string =>
  [x.month, x.region, x.city, x.chain, x.brand, x.sku, x.nanobrick || ''].join(SEP);

export function buildDerivedStructures(
  raw: {
    sales: RawSalesRow[];
    promos: RawPromoRow[];
    tv: RawTVRow[];
    visits: RawVisitRow[];
    market: RawMarketRow[];
  },
  existingSettings?: SettingsConfig
): DerivedStructures {
  const ownBrands = new Set<string>(raw.sales.map(r => r.brand));
  raw.market.forEach(r => { if (r.isOwn) ownBrands.add(r.brand); });

  const bm = new Map<string, number>();
  for (const r of raw.market) {
    const k = r.brand + SEP + r.market;
    bm.set(k, (bm.get(k) || 0) + r.salesRub);
  }

  const brandMarket = new Map<string, string>();
  const best = new Map<string, { m: string; v: number }>();
  for (const [k, v] of bm) {
    const [b, m] = k.split(SEP);
    if (!best.has(b) || v > best.get(b)!.v) best.set(b, { m, v });
  }
  for (const [b, x] of best) brandMarket.set(b, x.m);

  const mktIdx = new Map<string, { rub: number; units: number }>();
  const compMonth = new Map<string, number>();
  for (const r of raw.market) {
    if (ownBrands.has(r.brand)) continue;
    // Map 'Region' in Market data to federalSubject logic
    const k = [r.market, r.region, r.month].join(SEP);
    const x = mktIdx.get(k) || { rub: 0, units: 0 };
    x.rub += r.salesRub;
    x.units += r.units;
    mktIdx.set(k, x);

    const k2 = r.market + SEP + r.month;
    compMonth.set(k2, (compMonth.get(k2) || 0) + r.salesRub);
  }

  const salesFine = new Map<string, SalesFineEntry>();
  for (const r of raw.sales) {
    const k = fkey(r);
    let x = salesFine.get(k);
    if (!x) {
      x = {
        id: salesFine.size,
        month: r.month,
        year: r.year,
        monthNum: r.monthNum,
        federalDistrict: r.federalDistrict,
        federalSubject: r.federalSubject,
        nanobrick: r.nanobrick,
        region: r.region,
        city: r.city,
        chain: r.chain,
        brand: r.brand,
        sku: r.sku,
        units: 0,
        rub: 0,
        nsrc: 0,
        mechs: [],
        rate: 0
      };
      salesFine.set(k, x);
    }
    x.units += r.units;
    x.rub += r.salesRub;
    x.nsrc++;
  }

  // Preserve granular panels alongside the legacy brand-month series. Aggregate
  // from salesFine (already normalized) so duplicate raw imports are surfaced
  // through dupKeys instead of being misclassified as separate SKU observations.
  const detailed = preparePanelSales([...salesFine.values()].map(x => ({
    month: x.month, brand: x.brand, region: x.region, chain: x.chain,
    sku: x.sku, units: x.units, salesRub: x.rub
  })));

  let dupKeys = 0;
  for (const x of salesFine.values()) if (x.nsrc > 1) dupKeys++;

  const pidx = new Map<string, { recs: RawPromoRow[]; hit: boolean }>();
  for (const p of raw.promos) {
    // Ignore City for Promo (network-wide)
    const k = [p.month, p.chain, p.brand, p.sku, p.region || ''].join(SEP);
    let e = pidx.get(k);
    if (!e) { e = { recs: [], hit: false }; pidx.set(k, e); }
    e.recs.push(p);
  }

  for (const x of salesFine.values()) {
    const pats = new Set([
      '',
      x.region,
      x.federalSubject || ''
    ].map(reg => [x.month, x.chain, x.brand, x.sku, reg].join(SEP)));

    const ms = new Map<string, number[]>();
    for (const pk of pats) {
      const e = pidx.get(pk);
      if (!e) continue;
      e.hit = true;
      for (const rec of e.recs) {
        const mechanic = rec.mechanic || 'Не указана';
        if (!ms.has(mechanic)) ms.set(mechanic, []);
        ms.get(mechanic)!.push(rec.bonusPct);
      }
    }
    x.mechs = [...ms].map(([m, a]) => ({ m, rate: avg(a) }));
    x.rate = sum(x.mechs, 'rate');
  }

  let orphans = 0;
  for (const e of pidx.values()) if (!e.hit) orphans += e.recs.length;

  const mp = new Map<string, { brand: string; month: string; units: number; salesRub: number; rateSum: number; nFine: number }>();
  const tvm = new Map<string, number>();
  const vm = new Map<string, number>();

  for (const r of raw.tv) {
    const k = r.brand + SEP + r.month;
    tvm.set(k, (tvm.get(k) || 0) + (r.trp || 0));
  }
  for (const r of raw.visits) {
    const k = r.brand + SEP + r.month;
    vm.set(k, (vm.get(k) || 0) + (r.visits || 0));
  }

  for (const x of salesFine.values()) {
    const k = x.brand + SEP + x.month;
    let y = mp.get(k);
    if (!y) {
      y = { brand: x.brand, month: x.month, units: 0, salesRub: 0, rateSum: 0, nFine: 0 };
      mp.set(k, y);
    }
    y.units += x.units;
    y.salesRub += x.rub;
    y.rateSum += x.rate;
    y.nFine++;
  }

  // Непрерывный календарный грид по всем 5 источникам
  const allRawMonths = [
    ...raw.sales.map(r => r.month),
    ...raw.promos.map(r => r.month),
    ...raw.tv.map(r => r.month),
    ...raw.visits.map(r => r.month),
    ...raw.market.map(r => r.month)
  ].filter(Boolean);
  const sortedRawMonths = uniq(allRawMonths).sort();

  let months: string[] = [];
  if (sortedRawMonths.length > 0) {
    const minM = sortedRawMonths[0];
    const maxM = sortedRawMonths[sortedRawMonths.length - 1];
    let curM = minM;
    while (curM <= maxM) {
      months.push(curM);
      curM = mAdd(curM, 1);
    }
  }

  // Для каждого собственного бренда и каждого месяца гарантируем запись в панели (пробелы = 0)
  for (const b of ownBrands) {
    for (const m of months) {
      const k = b + SEP + m;
      if (!mp.has(k)) {
        mp.set(k, { brand: b, month: m, units: 0, salesRub: 0, rateSum: 0, nFine: 0 });
      }
    }
  }

  // Отслеживаем первый месяц появления каждого SKU в конкретной сети/городе
  const skuFirstMonth = new Map<string, string>();
  for (const x of salesFine.values()) {
    const k = [x.region, x.chain, x.brand, x.sku].join(SEP);
    const curFirst = skuFirstMonth.get(k);
    if (!curFirst || x.month < curFirst) skuFirstMonth.set(k, x.month);
  }

  const panel: PanelRecord[] = [...mp.values()].map(y => {
    const k = y.brand + SEP + y.month;
    const mk = brandMarket.get(y.brand);
    return {
      brand: y.brand,
      month: y.month,
      units: y.units,
      salesRub: y.salesRub,
      trp: tvm.get(k) || 0,
      hasTRP: tvm.has(k),
      visits: vm.get(k) || 0,
      hasVis: vm.has(k),
      bonusIdx: y.nFine ? y.rateSum / y.nFine : 0,
      comp: mk ? (compMonth.get(mk + SEP + y.month) || 0) : 0,
      next: null
    };
  }).sort((a, b) => a.month.localeCompare(b.month) || a.brand.localeCompare(b.brand));

  const pm = new Map(panel.map(r => [r.brand + SEP + r.month, r]));
  panel.forEach(r => { r.next = pm.get(r.brand + SEP + mAdd(r.month, 1)) || null; });

  const st = existingSettings || {
    nM: 3,
    minH: 2,
    excl: true,
    adj: false,
    method: 'dual',
    margin: 0.48
  };

  return {
    ownBrands,
    brandMarket,
    mktIdx,
    salesFine,
    dupKeys,
    orphans,
    months,
    skuFirstMonth,
    panel,
    detailedPanel: detailed.panels,
    detailedPanelErrors: detailed.errors,
    atoms: [],
    promoRows: 0,
    adjFail: 0,
    dualStats: {
      sumRollingDR: 0,
      sumCfDR: 0,
      countDual: 0
    },
    st
  };
}
