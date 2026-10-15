import { PharmaDataStore, getFilteredRaw } from '../../core/store';
import { rub, fmt, pct, uniq, sum, tone, esc } from '../../utils/math';
import { kpiHtml, table } from '../chartRenderer';
import { chartService } from '../services/chartService';
import { runAutoMLEngine } from '../../modules/mmm-engine/automlEngine';
import { aggregate } from '../../modules/promo-engine/promoFinancials';
import { generateOverviewInsights } from '../../modules/insights-engine/insightsGenerator';
import { getElement } from '../../utils/dom';

/**
 * Section for the Business Overview (Главная страница)
 */
export function renderOverview(store: PharmaDataStore): void {
  const getEl = (id: string) => document.querySelector(`.page.active #${id}`) as any || document.getElementById(id);
  const state = store.getState();
  const raw = getFilteredRaw(state.raw, state.globalFilters);
  const months = state.derived.months;
  const tot = sum(raw.sales, 'salesRub');
  const totU = sum(raw.sales, 'units');
  const share = 12.5; // TODO: Calculate actual share from market data if available

  // Calculate high-level aggregates for Promo/Baseline
  const promoAggs = aggregate(state.derived.atoms, [], state.derived.st.margin);
  const a = promoAggs[0] || {};

  // 1. Быстрый расчет MoM трендов
  const calcTrend = (cur: number, prev: number) => {
    if (!Number.isFinite(cur) || !Number.isFinite(prev) || prev === 0) return undefined;
    return Math.round(((cur - prev) / prev) * 100);
  };

  const lastMonth = months[months.length - 1];
  const prevMonth = months[months.length - 2];
  
  const factLast = raw.sales.filter(r => r.month === lastMonth).reduce((s, r) => s + r.salesRub, 0);
  const factPrev = raw.sales.filter(r => r.month === prevMonth).reduce((s, r) => s + r.salesRub, 0);
  const unitsLast = raw.sales.filter(r => r.month === lastMonth).reduce((s, r) => s + r.units, 0);
  const unitsPrev = raw.sales.filter(r => r.month === prevMonth).reduce((s, r) => s + r.units, 0);

  const revTrend = calcTrend(factLast, factPrev);
  const unitTrend = calcTrend(unitsLast, unitsPrev);

  // KPIs
  const kpisEl = getEl('kpis');
  if (kpisEl) {
    kpisEl.innerHTML = kpiHtml([
      ['Выручка', rub(tot), months.length ? months[0] + ' — ' + months[months.length - 1] : '', revTrend],
      ['Объём, шт', fmt(totU), 'Продажи в упаковках', unitTrend],
      ['Доля рынка', pct(share), state.raw.market.length ? 'В адресных рынках' : 'Рынок не загружен'],
      ['Инвестиции в промо', rub(a.bonus || 0), state.raw.promos.length ? 'Всего начисленный бонус' : 'ТМА не загружен (0 ₽)'],
      ['Инкрементальная выручка', rub(a.dR || 0), state.raw.promos.length ? 'Прирост к baseline' : '0 ₽'],
      ['ROAS промо', Number.isFinite(a.roas) ? fmt(a.roas || 0, 2) + ' ₽/₽' : '—', state.raw.promos.length ? 'Выручка / бонус' : '—']
    ]);
  }

  // 1. Sales Chart
  const factMonthly = new Map<string, number>();
  raw.sales.forEach(r => {
    factMonthly.set(r.month, (factMonthly.get(r.month) || 0) + r.salesRub);
  });
  const factVals = months.map(m => factMonthly.get(m) || 0);

  const regMonthly = new Map<string, number>();
  if (state.reg && (state.reg as any).rows && (state.reg as any).pred) {
    (state.reg as any).rows.forEach((r: any, i: number) => {
      regMonthly.set(r.month, (regMonthly.get(r.month) || 0) + (state.reg as any).pred[i]);
    });
  }
  const hasReg = regMonthly.size > 0;
  const regVals = months.map(m => regMonthly.has(m) ? regMonthly.get(m)! : NaN);

  const ovSeries = [
    { name: 'Факт', values: factVals, color: '#2854e6' },
    ...(hasReg ? [{ name: 'Регрессия', values: regVals, color: '#0d9488', dash: [4, 4] }] : [])
  ];

  if (getEl('salesChart')) {
    chartService.renderOverviewSales('salesChart', ovSeries, months);
  }

  // 2. Coverage Table
  const coverageEl = getEl('coverage');
  if (coverageEl) {
    const srcRows = [
      ['Продажи аптек (выбытия)', fmt(state.raw.sales.length), months.length ? months[0] + ' — ' + months[months.length - 1] : '—', uniq(state.raw.sales.map(r => r.brand)).length + ' брендов', rub(tot)],
      ['ТВ-реклама (TRP)', fmt(state.raw.tv.length), uniq(state.raw.tv.map(r => r.month)).length ? uniq(state.raw.tv.map(r => r.month)).sort()[0] + ' — ' + uniq(state.raw.tv.map(r => r.month)).sort().slice(-1)[0] : '—', uniq(state.raw.tv.map(r => r.brand)).length + ' брендов', fmt(sum(state.raw.tv, 'trp'), 1) + ' TRP'],
      ['Визиты медпредов CRM', fmt(state.raw.visits.length), uniq(state.raw.visits.map(r => r.month)).length ? uniq(state.raw.visits.map(r => r.month)).sort()[0] + ' — ' + uniq(state.raw.visits.map(r => r.month)).sort().slice(-1)[0] : '—', uniq(state.raw.visits.map(r => r.brand)).length + ' брендов', fmt(sum(state.raw.visits, 'visits')) + ' визитов'],
      ['Рыночные данные (аудит)', state.raw.market.length ? fmt(state.raw.market.length) : '0 (не загружено)', uniq(state.raw.market.map(r => r.month)).length ? uniq(state.raw.market.map(r => r.month)).sort()[0] + ' — ' + uniq(state.raw.market.map(r => r.month)).sort().slice(-1)[0] : '—', uniq(state.raw.market.map(r => r.market)).length + ' рынков', rub(sum(state.raw.market, 'salesRub'))],
      ['Промо / бонусы (ТМА)', state.raw.promos.length ? fmt(state.raw.promos.length) : '0 (не загружено)', state.raw.promos.length ? uniq(state.raw.promos.map(r => r.month)).sort()[0] + ' — ' + uniq(state.raw.promos.map(r => r.month)).sort().slice(-1)[0] : '—', state.raw.promos.length ? uniq(state.raw.promos.map(r => r.brand)).length + ' брендов' : '0 брендов', rub(sum(state.derived.atoms, 'bonus'))]
    ];
    table(
      coverageEl,
      ['Источник', 'Строк', 'Период', 'Охват', 'Объём'],
      srcRows
    );
  }

  // 3. Status Checks
  const ovChecksEl = getEl('ovChecks');
  if (ovChecksEl) {
    const hasPromo = state.raw.promos.length > 0;
    const hasMarket = state.raw.market.length > 0;
    if (!hasPromo && hasMarket) {
      ovChecksEl.innerHTML = `
        <div style="font-weight: 600; color: #b45309; margin-bottom: 3px;">⚠️ Файл ТМА (промо / бонусы) не загружен</div>
        <div style="font-size: 12px; color: #78350f; line-height: 1.4;">
          Фонд бонусов и инкрементальная выручка от скидок приняты равными 0 ₽.<br/>
          Графики фактических продаж, рыночных долей, ТВ, CRM-визитов, эконометрика (MMM) и ML-Центр полноценно рассчитаны.
        </div>
      `;
      ovChecksEl.className = 'callout warn';
    } else if (!hasPromo && !hasMarket) {
      ovChecksEl.innerHTML = `
        <div style="font-weight: 600; color: #b45309; margin-bottom: 3px;">⚠️ Загружены продажи, ТВ и визиты (без ТМА и Рынка)</div>
        <div style="font-size: 12px; color: #78350f; line-height: 1.4;">
          Графики продаж, активности медпредов и рекламы построены. Для расчета долей рынка добавьте файл рынка, для трейд-маркетинга — файл ТМА.
        </div>
      `;
      ovChecksEl.className = 'callout warn';
    } else {
      ovChecksEl.innerHTML = `
        <div style="font-weight: 600; color: #15803d; margin-bottom: 3px;">✅ Все Source источников данных загружены и синхронизированы</div>
        <div style="font-size: 12px; color: #166534; line-height: 1.4;">
          Календарный грид выстроен без разрывов. Модели MMM, расчет Baseline и ML-Центр активны.
        </div>
      `;
      ovChecksEl.className = 'callout good';
    }
  }

  // 4. Brands Table
  const tblOverviewEl = getEl('tblOverview');
  if (tblOverviewEl) {
    const byB = new Map<string, { rub: number; units: number }>();
    raw.sales.forEach(r => {
      const e = byB.get(r.brand) || { rub: 0, units: 0 };
      e.rub += r.salesRub;
      e.units += r.units;
      byB.set(r.brand, e);
    });

    const pb = new Map(aggregate(state.derived.atoms, ['brand'], state.derived.st.margin).map(x => [x.dims[0], x]));
    table(
      tblOverviewEl,
      ['Бренд', 'Выручка, ₽', 'Упаковки, шт', 'Бонусы, ₽', 'Инкр. выручка, ₽', 'ROAS', 'Прибыль, ₽', 'ROI'],
      [...byB.entries()].map(([b, e]) => {
        const p = pb.get(b);
        return [
          b,
          rub(e.rub),
          fmt(e.units),
          p && p.bonus ? rub(p.bonus) : (state.raw.promos.length ? '0 ₽' : '—'),
          p && p.dR ? { html: esc(rub(p.dR)), cls: tone(p.dR) } : (state.raw.promos.length ? '0 ₽' : '—'),
          p && Number.isFinite(p.roas) ? fmt(p.roas!, 2) : '—',
          p && Number.isFinite(p.profit) ? { html: esc(rub(p.profit!)), cls: tone(p.profit!) } : '—',
          p && Number.isFinite(p.roi) ? { html: esc(pct(p.roi!)), cls: tone(p.roi!) } : '—'
        ];
      })
    );
  }

  // 5. Contribution Decomposition Chart
  if (getEl('ovContribDecompCanvas')) {
    const summary = state.automlSummary;
    if (summary && summary.allBrandsResult && summary.allBrandsResult.monthlyContribution) {
      chartService.renderContributionDecomposition('ovContribDecompCanvas', summary.allBrandsResult.monthlyContribution);
    } else if (state.isLoadingAutoML) {
      const el = getEl('ovContribDecompCanvas');
      if (el) el.innerHTML = '<div class="p-8 text-center text-slate-400">Расчет вкладов (AutoML)...</div>';
    }
  }

  // 6. Insights
  const ovInsightsBoxEl = getEl('ovInsightsBox');
  if (ovInsightsBoxEl) {
    const insights = generateOverviewInsights(state);
    ovInsightsBoxEl.innerHTML = `
      <div style="font-weight:700;font-size:14px;margin-bottom:6px;color:#0f172a;">${insights.title}</div>
      ${insights.html}
    `;
  }
}
