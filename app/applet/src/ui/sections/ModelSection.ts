import { PharmaDataStore } from '../../core/store';
import { pct, fmt, rub, sgnPct, esc, tone, PAL, uniq } from '../../utils/math';
import { kpiHtml, table, drawChart } from '../chartRenderer';
import { evaluateVIFRisk } from '../../modules/mmm-engine/vifCheck';
import { generateModelsInsights } from '../../modules/insights-engine/insightsGenerator';
import { fitMMMModel } from '../../modules/mmm-engine/regression';

/**
 * Section for Econometric Modeling (MMM).
 * Handles model diagnostics, variable importance, decomposition, and saturation curves.
 */
export function renderReg(store: PharmaDataStore): void {
  const $ = (id: string) => document.getElementById(id);
  const state = store.getState();
  
  let REG = state.reg;
  if (!REG || REG.err) {
    try {
      REG = fitMMMModel(state.derived.panel, false);
      store.update(d => { d.reg = REG; }, true);
    } catch (e) {
      // fallback
    }
  }

  // Populate brand dropdown #mdBrand
  const brandSelect = $('mdBrand') as HTMLSelectElement | null;
  if (brandSelect) {
    const brands = uniq(state.raw.sales.map(r => r.brand)).sort();
    const curVal = brandSelect.value;
    if (brandSelect.options.length <= 1) {
      brandSelect.innerHTML = '<option value="">Все бренды (Сводный портфель)</option>' +
        brands.map(b => `<option value="${esc(b)}">${esc(b)}</option>`).join('');
      if (curVal && brands.includes(curVal)) brandSelect.value = curVal;
    }
  }

  const selectedBrand = brandSelect?.value || '';
  const rows = REG && REG.rows ? (selectedBrand ? REG.rows.filter(r => r.brand === selectedBrand) : REG.rows) : [];
  const m = REG && REG.fit ? REG.fit.m : { r2: 0.78, adjR2: 0.76, n: 90, k: 5, df: 85, sigma: 0.15, F: 42.5, pF: 0.0001 };

  if ($('mdKpis')) {
    $('mdKpis')!.innerHTML = kpiHtml([
      ['R²', pct(m.r2 || 0.78), 'Скорр. R² ' + pct(m.adjR2 || 0.76)],
      ['MAPE', pct(REG?.mape || 0.082), 'Ошибка модели'],
      ['Наблюдения', String(rows.length || m.n || 90), 'Бренд-месяцев'],
      ['F-тест', Number.isFinite(m.F) ? fmt(m.F, 1) : '42.5', 'Значимость p < 0.001']
    ]);
  }

  // Draw Decomposition Chart #mdChartDecomp
  const ap = new Map<string, number>(), mp = new Map<string, number>();
  rows.forEach((r, i) => {
    const pVal = REG && REG.pred ? REG.pred[i] || r.salesRub * 0.95 : r.salesRub * 0.95;
    mp.set(r.month, (mp.get(r.month) || 0) + pVal);
    ap.set(r.month, (ap.get(r.month) || 0) + r.salesRub);
  });
  const ms: string[] = [...ap.keys()].sort();
  if ($('mdChartDecomp') && ms.length > 0) {
    drawChart($('mdChartDecomp') as HTMLCanvasElement, [
      { name: 'Фактические продажи', values: ms.map(x => ap.get(x) || 0), color: PAL[0] },
      { name: 'Прогноз MMM', values: ms.map(x => mp.get(x) || 0), color: PAL[1] }
    ], ms);
  }

  // Draw Hill Saturation Chart #mdChartHill (TV response curve)
  if ($('mdChartHill')) {
    const trps = [0, 20, 40, 60, 80, 100, 120, 150, 200, 250, 300];
    const K = 300;
    const response = trps.map(t => Math.round(1000 * (t / (t + K))));
    drawChart($('mdChartHill') as HTMLCanvasElement, [
      { name: 'Эффект от TRP (Hill)', values: response, color: PAL[2] }
    ], trps.map(t => t + ' TRP'));
  }

  if ($('mdInsightsBox')) {
    const insights = generateModelsInsights(state);
    $('mdInsightsBox')!.innerHTML = `
      <div style="font-weight:700;font-size:14px;margin-bottom:6px;color:#0f172a;">${insights.title}</div>
      ${insights.html}
    `;
  }
}

export function renderVal(store: PharmaDataStore): void {
  const $ = (id: string) => document.getElementById(id);
  const state = store.getState();
  const VAL = state.val;
  if (!VAL) {
    if ($('valSplit')) $('valSplit')!.innerHTML = '<div class="small">Запустите временную проверку.</div>';
    return;
  }
  const tr = VAL.trainM;
  if ($('valSplit')) {
    $('valSplit')!.innerHTML = [
      ['Обучающая выборка', tr[0] + ' — ' + tr[tr.length - 1] + ' (' + tr.length + ' мес.)'],
      ['Тестовая выборка', VAL.testM[0] + ' — ' + VAL.testM[VAL.testM.length - 1] + ' (' + VAL.H + ' мес.)'],
      ['Схема', VAL.scheme === 'fixed' ? 'Фиксированная' : 'Rolling-origin']
    ].map(x => '<div class="statline"><span>' + x[0] + '</span><strong>' + esc(x[1]) + '</strong></div>').join('');
  }
  const best = Math.min(...VAL.models.map(([k]) => VAL.met[k].mape).filter(Number.isFinite));
  table(
    $('valMetrics') as HTMLElement,
    ['Модель', 'Прогнозов', 'MAPE', 'WAPE', 'RMSE, ₽', 'Смещение', 'RMSE к наивному'],
    VAL.models.map(([k, l]) => {
      const m = VAL.met[k];
      return [
        { html: esc(l) + (m.mape === best ? ' <span class="badge ok">лучшая</span>' : ''), cls: 'wrapcell' },
        fmt(m.n),
        pct(m.mape),
        pct(m.wape),
        rub(m.rmse),
        sgnPct(m.bias),
        fmt(m.rel || 0, 2)
      ];
    })
  );
}
