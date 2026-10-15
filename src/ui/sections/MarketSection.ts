import { PharmaDataStore } from '../../core/store';
import { rub, fmt, pct, sgnPct, pp, sum, PAL, esc, tone, mAdd } from '../../utils/math';
import { kpiHtml, drawChart, table, legendHtml } from '../chartRenderer';
import { marketCalc } from '../../modules/promo-engine/promoFinancials';

/**
 * Section for Market Context & Competitor Analysis.
 */
export function renderMarket(store: PharmaDataStore): void {
  const getEl = (id: string) => document.querySelector(`.page.active #${id}`) as any || document.getElementById(id);
  const $ = (id: string) => getEl(id);
  const state = store.getState();
  const mkt = $('mkMarket') ? ($('mkMarket') as HTMLSelectElement).value : '';
  
  if (!state.raw.market.length || !mkt) {
    if ($('mkKpis')) $('mkKpis')!.innerHTML = '';
    if ($('mkTable')) $('mkTable')!.innerHTML = '';
    if ($('mkCheck')) $('mkCheck')!.textContent = 'Рыночные данные отсутствуют.';
    return;
  }

  const metric = ($('mkMetric') as HTMLSelectElement).value;
  const reg = ($('mkRegion') as HTMLSelectElement).value;
  const W = +(($('mkWin') as HTMLSelectElement).value);

  const R = marketCalc(state.raw.market, mkt, reg, metric, W, state.derived.ownBrands);
  if (!R) return;

  const own = R.list.filter(x => x.own);
  const ownCur = sum(own, 'cur');
  const ownPrev = sum(own, 'prev');
  const sh = R.tc > 0 ? ownCur / R.tc : NaN;
  const shp = R.tp > 0 ? ownPrev / R.tp : NaN;
  const u = metric === 'units' ? fmt : rub;

  if ($('mkKpis')) {
    $('mkKpis')!.innerHTML = kpiHtml([
      ['Объём рынка', u(R.tc), 'Окно ' + R.cur[0] + ' — ' + R.cur[R.cur.length - 1]],
      ['Рост рынка к пред. окну', sgnPct(R.mg), 'Окно ' + R.w + ' мес.'],
      ['Рост рынка г/г', sgnPct(R.mgYoy), 'К тому же окну год назад'],
      ['Доля наших брендов', pct(sh), Number.isFinite(shp) ? 'Было ' + pct(shp) + ' (' + pp(sh - shp) + ')' : 'Нет пред. окна']
    ]);
  }

  const ser = R.series.map((s, i) => ({ ...s, color: PAL[i % PAL.length] }));
  if ($('mkChartShare')) {
    drawChart($('mkChartShare') as HTMLCanvasElement, ser, R.months, { zero: false, fmt: (v: number) => (v * 100).toFixed(1) + '%', padL: 40 });
  }
  if ($('mkShareLg')) {
    $('mkShareLg')!.innerHTML = legendHtml(ser);
  }

  // Brand price indices
  const priceSeries: Array<{ name: string; values: number[]; color: string }> = [];
  const topBrands = R.list.map(x => x.brand).slice(0, 6);
  topBrands.forEach((b, i) => {
    const pVals = R.months.map(m => {
      let bRub = 0, bUnits = 0, mRub = 0, mUnits = 0;
      for (const r of state.raw.market) {
        if (r.month !== m) continue;
        if (reg && r.region !== reg) continue;
        if (r.market !== mkt) continue;
        mRub += r.salesRub;
        mUnits += r.units;
        if (r.brand === b) {
          bRub += r.salesRub;
          bUnits += r.units;
        }
      }
      const bPrice = bUnits > 0 ? bRub / bUnits : 0;
      const mPrice = mUnits > 0 ? mRub / mUnits : 0;
      return mPrice > 0 && bPrice > 0 ? Math.round((bPrice / mPrice) * 100) : 100;
    });
    priceSeries.push({ name: b, values: pVals, color: PAL[i % PAL.length] });
  });

  if ($('mkChartPrice')) {
    drawChart($('mkChartPrice') as HTMLCanvasElement, priceSeries, R.months, { zero: false, fmt: (v: number) => v.toFixed(0) + ' pt', padL: 40 });
  }
  if ($('mkPriceLg')) {
    $('mkPriceLg')!.innerHTML = legendHtml(priceSeries);
  }

  table(
    $('mkTable') as HTMLElement,
    ['Бренд', 'Тип', 'Продажи окна', 'Доля', 'Δ доли к пред.', 'Δ доли г/г', 'Рост к пред.', 'Рост г/г', 'Цена, ₽/шт', 'Δ цены', 'Темп vs рынок'],
    R.list.map(x => [
      x.brand,
      x.own ? 'Наш' : 'Конкурент',
      u(x.cur),
      pct(x.share),
      { html: esc(pp(x.dShare)), cls: tone(x.dShare) },
      { html: esc(pp(x.dShareYoy)), cls: tone(x.dShareYoy) },
      { html: esc(sgnPct(x.g)), cls: tone(x.g) },
      { html: esc(sgnPct(x.gYoy)), cls: tone(x.gYoy) },
      fmt(x.price, 0),
      sgnPct(x.dPrice),
      Number.isFinite(x.g) && Number.isFinite(R.mg) ? (x.g > R.mg ? 'Быстрее рынка' : 'Медленнее рынка') : '—'
    ])
  );

  const ok = Math.abs(R.shareSum - 1) < 1e-9;
  if ($('mkCheck')) {
    $('mkCheck')!.className = 'callout ' + (ok ? 'good' : 'bad');
    $('mkCheck')!.textContent = 'Сверка: Σ долей брендов в окне = ' + pct(R.shareSum, 2) + (ok ? ' (корректно).' : ' — ошибка агрегирования.');
  }

  if ($('mkInsightsBox')) {
    const ownLeader = R.list.find(x => x.own);
    const topComp = R.list.find(x => !x.own);
    $('mkInsightsBox')!.innerHTML = `
      <div style="font-weight:700;font-size:14px;margin-bottom:6px;color:#0f172a;">💡 Аналитическая выжимка по рыночной позиции и конкурентам</div>
      <div style="font-size:12px;line-height:1.5;color:#334155;">
        • <b>Динамика сегмента:</b> В окне (${R.w} мес.) объём рынка «${mkt}» составляет <b>${u(R.tc)}</b>, с темпом роста <b>${sgnPct(R.mg)}</b> к предыдущему окну и <b>${sgnPct(R.mgYoy)}</b> г/г.<br/>
        • <b>Позиция портфеля:</b> Доля наших брендов составляет <b>${pct(sh)}</b>. ${ownLeader ? 'Основной лидер портфеля — ' + ownLeader.brand + ' (' + pct(ownLeader.share) + ' рынка, темп: ' + sgnPct(ownLeader.g) + ').' : ''}<br/>
        • <b>Конкурентный фокус:</b> ${topComp ? 'Ключевой конкурент — ' + topComp.brand + ' (доля ' + pct(topComp.share) + ', цена ' + fmt(topComp.price, 0) + ' ₽/шт).' : 'Портфель удерживает лидерство.'}<br/>
        • <b>Стратегическая рекомендация:</b> ${R.mg < 0 ? 'При падающем рынке сдерживайте ценовую агрессию и акцентируйте внимание на таргетированных промо в топ-сетях.' : 'Используйте рост рынка для расширения дистрибьюции и проведения совместных ТМА-кампаний.'}
      </div>
    `;
  }

  // 7. Regional Breakdown (Operations Hub)
  const mkRegEl = document.getElementById('mkRegTable');
  if (mkRegEl && state.raw.market.length) {
    const regMap = new Map<string, { cur: number; prev: number }>();
    for (const r of state.raw.market) {
      if (r.market !== mkt) continue;
      const e = regMap.get(r.region) || { cur: 0, prev: 0 };
      const isCur = R.cur.includes(r.month);
      const isPrev = R.prev.includes(r.month);
      if (isCur) e.cur += r.salesRub;
      if (isPrev) e.prev += r.salesRub;
      regMap.set(r.region, e);
    }
    const regRows = Array.from(regMap.entries())
      .sort((a, b) => b[1].cur - a[1].cur)
      .map(([name, vals]) => {
        const growth = vals.prev > 0 ? (vals.cur / vals.prev - 1) * 100 : 0;
        return [name, rub(vals.cur), pct(vals.cur / R.tc), { html: esc(sgnPct(growth)), cls: tone(growth) }];
      });
    table(mkRegEl as HTMLElement, ['Регион (Federal Subject)', 'Выручка рынка', 'Доля в сегменте', 'Рост к пред.'], regRows);
  }
}
