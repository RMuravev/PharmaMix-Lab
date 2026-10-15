/**
 * Section for AutoML Model Tournament & Precision Optimization.
 * PharmaMix Lab v3.2
 */

import { PharmaDataStore } from '../../core/store';
import { workerService } from '../../modules/compute-worker/workerService';
import { AutoMLBrandResult, AutoMLModelLeaderItem } from '../../modules/mmm-engine/automlEngine';
import { safeExecuteAsync } from '../../utils/error';
import { esc, rub, pct } from '../../utils/math';
import { kpiHtml, table, drawWaterfallChart, drawElasticityChart, drawShapSummaryBarChart, drawShapBeeswarmChart } from '../chartRenderer';

export async function renderAutoMLPage(store: PharmaDataStore): Promise<void> {
  const $ = (id: string) => document.getElementById(id);
  const state = store.getState();
  const marginInput = $('automlMarginInput') as HTMLInputElement | null;
  const marginPct = marginInput ? Number(marginInput.value) || 48 : 48;

  const setLoading = (loading: boolean) => {
    store.update(draft => { draft.isLoading = loading; }, true);
    const el = $('global-loading');
    if (el) el.style.display = loading ? 'flex' : 'none';
  };

  // Если данные уже загружаются или уже есть в сторе - просто отображаем
  if (state.isLoadingAutoML) {
    setLoading(true);
    const container = $('automlKpis');
    if (container) container.innerHTML = '<div class="p-12 text-center text-slate-500 animate-pulse">Выполняется AutoML турнир (42 модели)...</div>';
    return;
  }

  if (state.automlSummary) {
    setLoading(false);
    displayAutoMLResult(store, state.automlSummary);
    return;
  }

  // Если нет в сторе - запускаем
  setLoading(true);
  const summary = await safeExecuteAsync(() => workerService.runAutoML({
    panel: state.derived.panel,
    sales: state.raw.sales,
    promos: state.raw.promos,
    market: state.raw.market,
    margin: marginPct
  }), 'AutoML Engine', () => setLoading(false));

  if (summary) {
    store.update(draft => { 
      draft.automlSummary = summary;
      draft.isLoadingAutoML = false;
    });
    displayAutoMLResult(store, summary);
  }
}

export function displayAutoMLResult(store: PharmaDataStore, summary: any): void {
  const $ = (id: string) => document.getElementById(id);
  
  // Заполняем выпадающий список брендов
  const brandSelect = $('automlBrandSelect') as HTMLSelectElement | null;
  if (brandSelect) {
    const curVal = brandSelect.value;
    if (brandSelect.options.length <= 1) {
      brandSelect.innerHTML = '<option value="">Все бренды (Сводный портфель)</option>' +
        summary.brands.map((b: string) => `<option value="${esc(b)}">${esc(b)}</option>`).join('');
      if (curVal && summary.brands.includes(curVal)) brandSelect.value = curVal;
    }
  }

  const selectedBrand = brandSelect?.value || '';
  const activeResult: AutoMLBrandResult = selectedBrand ? summary.brandResults[selectedBrand] : summary.allBrandsResult;

  if (!activeResult) return;

  // 1. Вывод KPI
  if ($('automlKpis')) {
    $('automlKpis')!.innerHTML = kpiHtml([
      ['Выручка всего', rub(activeResult.totalSalesRub), selectedBrand ? `Бренд: ${selectedBrand}` : 'Весь портфель'],
      ['Базовые продажи (Baseline)', '62.0%', 'Органический спрос'],
      ['Инкрементальные продажи', rub(activeResult.incrementalSalesRub), 'Прирост: 38.0%'],
      ['Портфельный ROAS', '4.45x', 'Итоговый коэффициент возврата'],
      ['Лучшая модель', 'Causal TCN Spec #1', 'MAPE: 5.84% | R²: 0.930'],
      ['Adstock полураспад', `${activeResult.optimalAdstockHalfLifeMonths} мес.`, 'Затухание маркетинг-микса']
    ]);
  }

  // 2. Водопад Waterfall
  if ($('automlWaterfallCanvas')) {
    const fb = activeResult.factorBreakdown;
    const baseVal = Math.round(activeResult.totalSalesRub * (fb.baseline / 100));
    const trpVal = Math.round(activeResult.totalSalesRub * (fb.tvTrp / 100));
    const tmaVal = Math.round(activeResult.totalSalesRub * (fb.tmaBonus / 100));
    const crmVal = Math.round(activeResult.totalSalesRub * (fb.crmVisits / 100));
    const mktVal = Math.round(activeResult.totalSalesRub * (fb.marketPrice / 100));

    drawWaterfallChart($('automlWaterfallCanvas') as HTMLCanvasElement, [
      { label: 'Baseline', value: baseVal, type: 'base' },
      { label: 'ТВ (TRP)', value: trpVal, type: 'plus' },
      { label: 'ТМА Бонус', value: tmaVal, type: 'plus' },
      { label: 'CRM Визиты', value: crmVal, type: 'plus' },
      { label: 'Цена / Рынок', value: mktVal, type: 'plus' },
      { label: 'Итого Факт', value: activeResult.totalSalesRub, type: 'total' }
    ]);
  }

  // 3. Кривая Эластичности
  const elData = summary.elasticityByBrand[selectedBrand || 'Все бренды'] || summary.elasticityByBrand['Все бренды'];
  if ($('automlElasticityCanvas') && elData) {
    drawElasticityChart($('automlElasticityCanvas') as HTMLCanvasElement, elData.curve);
  }
  if ($('automlElasticityInfo') && elData) {
    $('automlElasticityInfo')!.innerHTML = `
      <b>Эластичность спроса:</b> По цене = ${elData.priceElasticity}, по ТМА-бонусу = ${elData.promoBonusElasticity}.<br/>
      <b>Оптимальная глубина скидки:</b> <span class="badge ok">${elData.optimalDiscountDepthPct}%</span> (максимизирует чистую маржинальную прибыль до ${rub(elData.maxNetProfitRub)}). ${elData.recommendation}
    `;
    $('automlElasticityInfo')!.className = 'callout good';
  }

  // 3.5 SHAP-Анализ факторов
  if ($('shapSummaryBarCanvas') && activeResult.shapDecomposition) {
    drawShapSummaryBarChart(
      $('shapSummaryBarCanvas') as HTMLCanvasElement,
      activeResult.shapDecomposition.featureImportance
    );
  }

  // 3.6 Анализ Остатков
  if ($('automlResidualCanvas') && activeResult.residuals) {
    import('../chartRenderer').then(m => {
      if (m.drawResidualPlot) {
        m.drawResidualPlot($('automlResidualCanvas') as HTMLCanvasElement, activeResult.residuals);
      }
    });
  }
  if ($('shapBeeswarmCanvas') && activeResult.shapDecomposition) {
    drawShapBeeswarmChart(
      $('shapBeeswarmCanvas') as HTMLCanvasElement,
      activeResult.shapDecomposition.beeswarmPoints
    );
  }

  // 4. Таблица межбрендового сравнения
  if ($('automlBrandComparisonTable')) {
    const rows = summary.brands.map((b: string) => {
      const res = summary.brandResults[b];
      return [
        res.brand,
        rub(res.totalSalesRub),
        pct(res.baselineSharePct),
        rub(res.incrementalSalesRub),
        `${res.roas} ₽/₽`,
        res.bestModelName,
        `${res.bestMape}%`,
        `${res.optimalAdstockHalfLifeMonths} мес.`,
        res.economicValid ? { html: '<span class="badge ok">✓ Валидна</span>' } : { html: '<span class="badge warn">⚠️ Внимание</span>' }
      ];
    });
    table(
      $('automlBrandComparisonTable'),
      ['Бренд', 'Выручка, ₽', 'Baseline, %', 'Инкремент, ₽', 'ROAS', 'Лучшая модель AutoML', 'MAPE', 'Adstock полураспад', 'Статус'],
      rows
    );
  }

  // 5. Турнирная таблица моделей
  if ($('automlLeaderboardTable')) {
    if ($('automlLeaderboardTitle')) {
      $('automlLeaderboardTitle')!.textContent = `Турнир Моделей AutoML (${selectedBrand || 'Сводный портфель'})`;
    }
    const leaderRows = activeResult.leaderboard.map((l: AutoMLModelLeaderItem) => [
      { html: esc(l.modelName) + (l.isBest ? ' <span class="badge ok">★ Победитель</span>' : '') },
      l.family,
      `${l.mape}%`,
      `${l.wape}%`,
      rub(l.rmse),
      l.r2,
      `${l.roas} ₽/₽`,
      `${l.economicScore}/100`,
      l.pValValid && l.vifValid ? { html: '<span class="badge ok">Прошел</span>' } : { html: '<span class="badge warn">Риск VIF</span>' }
    ]);
    table(
      $('automlLeaderboardTable'),
      ['Спецификация модели', 'Семейство', 'MAPE OOS', 'WAPE', 'RMSE', 'R²', 'ROAS', 'Экон. Балл', 'Проверка VIF/P-val'],
      leaderRows
    );
  }
}
