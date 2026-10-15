import { PharmaDataStore } from '../../core/store';
import { uniq, rub, fmt, pct, sgnPct, esc, tone } from '../../utils/math';
import { kpiHtml, drawChainsChart, drawMechsChart, table } from '../chartRenderer';
import { aggregate } from '../../modules/promo-engine/promoFinancials';
import { generatePromoInsights } from '../../modules/insights-engine/insightsGenerator';

/**
 * Section for Trade-Marketing & Pharmacy Chain Analysis (TMA).
 */
export function renderPromo(store: PharmaDataStore): void {
  const getEl = (id: string) => document.querySelector(`.page.active #${id}`) as any || document.getElementById(id);
  const $ = (id: string) => getEl(id);
  const state = store.getState();
  const selBrand = ($('prBrand') as HTMLSelectElement | null)?.value || '';
  const selChain = ($('prChain') as HTMLSelectElement | null)?.value || '';
  const selMech = ($('prMech') as HTMLSelectElement | null)?.value || '';

  // Helper to fill selects if they are empty
  const fillSel = (id: string, values: string[], defaultLabel: string) => {
    const el = $(id) as HTMLSelectElement | null;
    if (el && el.options.length <= 1) {
      el.innerHTML = `<option value="">${defaultLabel}</option>` + 
        values.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
    }
  };

  const allBrands = uniq(state.raw.sales.map(r => r.brand)).sort();
  fillSel('prBrand', allBrands, 'Все бренды');
  const allChains = uniq(state.derived.atoms.map(a => a.chain)).sort();
  fillSel('prChain', allChains, 'Все аптечные сети');
  const allMechs = uniq(state.derived.atoms.map(a => a.mech)).sort();
  fillSel('prMech', allMechs, 'Все механики');

  const pred = (a: any) => {
    if (selBrand && a.brand !== selBrand) return false;
    if (selChain && a.chain !== selChain) return false;
    if (selMech && a.mech !== selMech) return false;
    return true;
  };

  const atomsFiltered = state.derived.atoms.filter(pred);
  const T = aggregate(atomsFiltered, [], state.derived.st.margin)[0] || {
    bonus: 0, dR: 0, profit: 0, roas: 0, roi: 0, uplift: 0, be: 0, dU: 0, actRV: 0
  };

  if ($('prKpis')) {
    $('prKpis')!.innerHTML = kpiHtml([
      ['Инкрементальная выручка', rub(T.dR || 0), 'Прирост над baseline'],
      ['ТМА Бонусы (Выплаты)', rub(T.bonus || 0), 'Промо-фонд активов'],
      ['Чистая маржинальная прибыль', rub(T.profit || 0), 'С учетом маржи ' + pct(state.derived.st.margin, 0)],
      ['Средний ROAS ТМА', Number.isFinite(T.roas) ? fmt(T.roas || 0, 2) + ' ₽/₽' : '—', (T.roas ?? 0) >= 1 ? 'Окупается' : 'Неокупаемо'],
      ['Финансовый ROI', Number.isFinite(T.roi) ? pct(T.roi || 0) : '—', (T.roi ?? 0) > 0 ? 'Прибыльно' : 'Убыточно'],
      ['Прирост объёма (Uplift)', sgnPct(T.uplift || 0), 'Относительно baseline']
    ]);
  }

  const PCOLS = ['Акций', 'Оценено', 'Факт (оц.), ₽', 'Baseline, ₽', 'Δ выручки, ₽', 'Δ шт', 'Бонус всего, ₽', 'Бонус оц., ₽', 'ROAS', 'ROI', 'Безуб. маржа', 'Аплифт'];
  const pcells = (g: any) => [
    fmt(g.n), fmt(g.nv), rub(g.actRV), rub(g.baseR),
    { html: esc(rub(g.dR)), cls: tone(g.dR) }, fmt(g.dU), rub(g.bonus), rub(g.bonusV),
    fmt(g.roas, 2), { html: esc(pct(g.roi)), cls: tone(g.roi) }, pct(g.be, 0),
    { html: esc(sgnPct(g.uplift)), cls: tone(g.uplift) }
  ];

  // 1. Pharmacy Chains
  const chainsAgg = aggregate(atomsFiltered, ['chain'], state.derived.st.margin).sort((a, b) => (b.dR || 0) - (a.dR || 0));
  table(
    $('prTblChains'),
    ['Аптечная сеть', 'Акций', 'Выручка факт, ₽', 'Бонус, ₽', 'Инкремент, ₽', 'Прибыль, ₽', 'ROAS', 'ROI'],
    chainsAgg.map(x => [
      x.dims[0], fmt(x.n || 0), rub(x.actRV || 0), rub(x.bonus || 0),
      { html: esc(rub(x.dR || 0)), cls: tone(x.dR || 0) },
      { html: esc(rub(x.profit || 0)), cls: tone(x.profit || 0) },
      fmt(x.roas || 0, 2), { html: esc(pct(x.roi || 0)), cls: tone(x.roi || 0) }
    ])
  );

  if ($('prChainsCanvas')) {
    drawChainsChart(
      $('prChainsCanvas') as HTMLCanvasElement,
      chainsAgg.map(x => ({ chain: x.dims[0], roas: x.roas || 0, incrementalRub: x.dR || 0, bonusRub: x.bonus || 0 }))
    );
  }

  // 2. Mechanics
  const mechsAgg = aggregate(atomsFiltered, ['mech'], state.derived.st.margin).sort((a, b) => (b.dR || 0) - (a.dR || 0));
  table(
    $('prTblMechs'),
    ['Механика', 'Акций', 'Выручка факт, ₽', 'Бонус, ₽', 'Инкремент, ₽', 'Прибыль, ₽', 'ROAS', 'Uplift, %'],
    mechsAgg.map(x => [
      x.dims[0], fmt(x.n || 0), rub(x.actRV || 0), rub(x.bonus || 0),
      { html: esc(rub(x.dR || 0)), cls: tone(x.dR || 0) },
      { html: esc(rub(x.profit || 0)), cls: tone(x.profit || 0) },
      fmt(x.roas || 0, 2), { html: esc(sgnPct(x.uplift || 0)), cls: tone(x.uplift || 0) }
    ])
  );

  if ($('prMechsCanvas')) {
    drawMechsChart(
      $('prMechsCanvas') as HTMLCanvasElement,
      mechsAgg.map(x => ({ mechanic: x.dims[0], upliftPct: x.uplift || 0, profitRub: x.profit || 0, roas: x.roas || 0 }))
    );
  }

  // 3. Agreements Registry
  const regRows = aggregate(atomsFiltered, ['month', 'chain', 'brand', 'sku', 'mech'], state.derived.st.margin)
    .sort((a, b) => b.dims[0].localeCompare(a.dims[0]))
    .slice(0, 200);

  table(
    $('prTable'),
    ['Месяц', 'Сеть', 'Бренд', 'SKU', 'Механика', ...PCOLS],
    regRows.map(x => [...x.dims, ...pcells(x)])
  );

  // 4. Insights
  if ($('prInsightsBox')) {
    const insights = generatePromoInsights(state);
    $('prInsightsBox')!.innerHTML = `
      <div style="font-weight:700;font-size:14px;margin-bottom:6px;color:#0f172a;">${insights.title}</div>
      ${insights.html}
    `;
  }
}
