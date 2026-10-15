/**
 * Временная кросс-валидация OOS (Out-of-Sample Forecasting Validation)
 */

import { OOSValidationResult, PanelRecord } from '../../types/pharma';
import { SEP, avg, mAdd, mIdx, sum, uniq } from '../../utils/math';
import { MKT_VARS, fitPanel, makeSpec, predOLS } from '../mmm-engine/regression';
import { mlp } from '../mmm-engine/tcnModel';
import { validateOOSPreflight } from '../../application/services/oosPreflightService';
import { assertLegacyPanelGrain } from '../../application/services/detailedPanelAdapterService';

export function trainNNBenchmark(rows: PanelRecord[], allBrands: string[]) {
  const months = uniq(rows.map(r => r.month)).sort();
  const m0 = mIdx(months[0]);
  const vm = months.length >= 15 ? new Set(months.slice(-3)) : new Set<string>();

  const feat = (r: PanelRecord) => {
    const ang = (+r.month.slice(5, 7) - 1) / 12 * 2 * Math.PI;
    return [Math.log1p(r.trp), r.bonusIdx, Math.log1p(r.visits), (mIdx(r.month) - m0) / 12, Math.sin(ang), Math.cos(ang)];
  };

  const core = rows.filter(r => !vm.has(r.month));
  const val = rows.filter(r => vm.has(r.month));
  const ln = (r: PanelRecord) => Math.log(r.salesRub);

  const bmean = new Map<string, number>();
  for (const b of allBrands) {
    const a = core.filter(r => r.brand === b).map(ln);
    if (a.length) bmean.set(b, avg(a));
  }
  const gmean = avg(core.map(ln));
  const bm = (r: PanelRecord) => bmean.has(r.brand) ? bmean.get(r.brand)! : gmean;
  const yd = core.map(r => ln(r) - bm(r)), sy = Math.sqrt(avg(yd.map(v => v * v))) || 1;

  const F = core.map(feat), d = F[0].length, mu = Array(d).fill(0), sd = Array(d).fill(1);
  for (let j = 0; j < d; j++) {
    mu[j] = avg(F.map(r => r[j]));
    sd[j] = Math.sqrt(avg(F.map(r => (r[j] - mu[j]) ** 2))) || 1;
  }

  const st = (x: number[]) => x.map((v, j) => (v - mu[j]) / sd[j]);
  const Xc = F.map(st), Xv = val.map(r => st(feat(r))), yc = yd.map(v => v / sy), yv = val.map(r => (ln(r) - bm(r)) / sy);

  const nets: any[] = [];
  for (let s = 0; s < 5; s++) {
    nets.push(mlp(Xc, yc, Xv, yv, { h: 10, epochs: 500, lr: 0.01, wd: 1e-3, seed: 101 + s * 17, patience: 80 }));
  }

  const lnPred = (r: PanelRecord) => {
    const x = st(feat(r));
    return bm(r) + sy * avg(nets.map(f => f(x)));
  };
  const smear = avg(rows.map(r => Math.exp(ln(r) - lnPred(r))));
  return { predict: (r: PanelRecord) => Math.exp(lnPred(r)) * smear };
}

export async function runOOSValidation(
  panel: PanelRecord[],
  horizon = 6,
  scheme: 'fixed' | 'rolling' = 'fixed',
  onProgress?: (msg: string) => void
): Promise<OOSValidationResult> {
  assertLegacyPanelGrain(panel);
  const rows = panel.filter(r => r.salesRub > 0).sort((a, b) => a.month.localeCompare(b.month));
  const months: string[] = uniq(rows.map(r => r.month)).sort();

  if (months.length < horizon + 12) {
    throw Error('Для горизонта ' + horizon + ' мес. нужно не менее ' + (horizon + 12) + ' мес. истории; сейчас ' + months.length);
  }

  const brands: string[] = uniq(rows.map(r => r.brand)).sort();
  const testM: string[] = months.slice(-horizon);
  // Fail before fitting: filtered nonpositive sales must not silently erase
  // brand-month observations or create a misleading holdout comparison.
  const preflight = validateOOSPreflight(panel, testM);
  if (!preflight.valid) {
    throw new Error('OOS preflight: ' + preflight.errors.slice(0, 5).join('; '));
  }
  if (preflight.warnings.length) onProgress?.('OOS: ' + preflight.warnings.join('; '));
  const t0: string = testM[0];
  const trainAll = rows.filter(r => r.month < t0);
  const test = rows.filter(r => r.month >= t0);
  const preds: any[] = [];
  const byBM = new Map(rows.map(r => [r.brand + SEP + r.month, r]));

  const lastBefore = (b: string, lim: string) => {
    let best: PanelRecord | null = null;
    for (const r of rows) {
      if (r.brand === b && r.month < lim && (!best || r.month > best.month)) best = r;
    }
    return best;
  };

  const groups = scheme === 'fixed'
    ? [{ train: trainAll, test }]
    : testM.map(t => ({ train: rows.filter(r => r.month < t), test: rows.filter(r => r.month === t) }));

  let gi = 0;
  for (const g of groups) {
    gi++;
    if (onProgress) {
      onProgress('Обучение моделей: шаг ' + gi + ' из ' + groups.length + '…');
      await new Promise(r => setTimeout(r, 0));
    }
    const sp = makeSpec(g.train, brands, {});
    const sp0 = makeSpec(g.train, brands, { exclude: MKT_VARS });
    const f1 = fitPanel(g.train, sp);
    const f0 = fitPanel(g.train, sp0);
    const nn = trainNNBenchmark(g.train, brands);

    for (const r of g.test) {
      const lim = scheme === 'fixed' ? t0 : r.month;
      const nv = lastBefore(r.brand, lim);
      const sn: any = byBM.get(r.brand + SEP + mAdd(r.month, -12));
      preds.push({
        month: r.month,
        brand: r.brand,
        actual: r.salesRub,
        ols: predOLS(f1, r),
        ols0: predOLS(f0, r),
        nn: nn.predict(r),
        naive: nv ? nv.salesRub : NaN,
        snaive: sn && sn.month < (scheme === 'fixed' ? t0 : r.month) ? sn.salesRub : (nv ? nv.salesRub : NaN)
      });
    }
  }

  const models: Array<[string, string]> = [
    ['ols', 'Регрессия (с маркетингом)'],
    ['ols0', 'Регрессия без маркетинга (абляция)'],
    ['nn', 'Нейросеть MLP (benchmark)'],
    ['naive', 'Наивный прогноз']
  ];

  const met: Record<string, any> = {};
  for (const [k] of models) {
    const ok = preds.filter(p => Number.isFinite(p[k]));
    const e = ok.map(p => p[k] - p.actual);
    const A = sum(ok, 'actual');
    met[k] = {
      n: ok.length,
      mape: avg(ok.map(p => Math.abs(p[k] - p.actual) / p.actual)),
      wape: A ? sum(e.map(Math.abs)) / A : NaN,
      rmse: Math.sqrt(avg(e.map(v => v * v))),
      bias: A ? sum(e) / A : NaN
    };
  }

  const base = met.naive.rmse;
  Object.values(met).forEach((m: any) => { m.rel = base > 0 ? m.rmse / base : NaN; });

  return {
    preds,
    models,
    met,
    months,
    testM,
    H: horizon,
    scheme,
    trainN: trainAll.length,
    testN: test.length,
    trainM: months.filter(m => m < t0)
  };
}
