import { PharmaDataStore } from '../../core/store';
import { rub, pct, esc, fmt, tone, pp } from '../../utils/math';
import { kpiHtml, table, drawChart } from '../chartRenderer';

/**
 * Section for Scenario Comparison (Планирование: Сравнение сценариев)
 * Part of JTBD: Strategic Allocation & Forecasting
 */
export function renderScenarioPage(store: PharmaDataStore): void {
  const state = store.getState();
  const summary = state.automlSummary;

  const container = document.getElementById('page-scenario');
  if (!container) return;

  if (!summary) {
    container.innerHTML = `
      <div class="page-head">
        <h2>Сравнение сценариев</h2>
      </div>
      <div class="callout warn">
        Пожалуйста, сначала запустите AutoML Турнир или загрузите данные, чтобы сформировать базовый сценарий.
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="page-head">
      <div>
        <h2>Сравнение сценариев</h2>
        <p>Сопоставление Baseline, Оптимизированного и Пользовательского сценариев распределения бюджета</p>
      </div>
      <div class="flex gap-2">
        <button class="btn secondary" id="btnSaveScenario">Сохранить текущий как сценарий B</button>
        <button class="btn primary" id="btnExportScenarios">Экспорт сравнения (XLSX)</button>
      </div>
    </div>

    <div class="grid three" id="scenarioKpis"></div>

    <div class="grid two" style="margin-top: 20px;">
      <div class="card">
        <h3>Структура бюджета и продаж по сценариям</h3>
        <p class="sub">Сравнение инвестиций, базовых и инкрементальных продаж</p>
        <div class="chart-container" style="position:relative;height:300px;max-height:300px;width:100%;overflow:hidden;">
          <canvas id="scenarioBudgetCanvas"></canvas>
        </div>
      </div>
      <div class="card">
        <h3>Совокупная выручка и чистая прибыль</h3>
        <p class="sub">Сравнение финальных финансовых результатов сценариев</p>
        <div class="chart-container" style="position:relative;height:300px;max-height:300px;width:100%;overflow:hidden;">
          <canvas id="scenarioProfitCanvas"></canvas>
        </div>
      </div>
    </div>

    <div class="card" style="margin-top: 20px;">
      <h3>Детальное сравнение показателей</h3>
      <div class="table-wrap">
        <table id="scenarioTable"></table>
      </div>
    </div>
  `;

  // Render KPIs comparing Baseline vs Optimized
  const baseline = summary.allBrandsResult;
  const opt = summary.optimizedResult || baseline;

  const kpis = [
    ['Прирост выручки', rub(opt.totalSalesRub - baseline.totalSalesRub), `vs Baseline: ${pct((opt.totalSalesRub/baseline.totalSalesRub - 1)*100)}`, Math.round((opt.totalSalesRub/baseline.totalSalesRub - 1)*100)],
    ['Разница в прибыли', rub(opt.profit - baseline.profit), `ROI Δ: ${pct(opt.roi - baseline.roi)}`, Math.round(opt.roi - baseline.roi)],
    ['Эффективность (ROAS)', `${opt.roas} ₽/₽`, `Baseline: ${baseline.roas}`, Math.round((opt.roas/baseline.roas - 1)*100)]
  ];
  
  const kpiEl = document.getElementById('scenarioKpis');
  if (kpiEl) kpiEl.innerHTML = kpiHtml(kpis);

  // Render Charts for Scenario Comparison
  const cvsBudget = document.getElementById('scenarioBudgetCanvas') as HTMLCanvasElement | null;
  if (cvsBudget) {
    const baseSpend = Math.round(baseline.incrementalSalesRub / Math.max(0.1, baseline.roas));
    const optSpend = Math.round(opt.incrementalSalesRub / Math.max(0.1, opt.roas));
    const baseBase = Math.round(baseline.totalSalesRub - baseline.incrementalSalesRub);
    const optBase = Math.round(opt.totalSalesRub - opt.incrementalSalesRub);

    drawChart(cvsBudget, [
      { name: 'Сценарий A (Baseline)', values: [baseSpend, baseBase, baseline.incrementalSalesRub], color: '#64748b' },
      { name: 'Сценарий B (Оптимум)', values: [optSpend, optBase, opt.incrementalSalesRub], color: '#2854e6' }
    ], ['Бюджет (Инвестиции)', 'Базовые продажи', 'Инкрементал']);
  }

  const cvsProfit = document.getElementById('scenarioProfitCanvas') as HTMLCanvasElement | null;
  if (cvsProfit) {
    drawChart(cvsProfit, [
      { name: 'Сценарий A (Baseline)', values: [baseline.totalSalesRub, baseline.profit], color: '#64748b' },
      { name: 'Сценарий B (Оптимум)', values: [opt.totalSalesRub, opt.profit], color: '#10b981' }
    ], ['Общая выручка', 'Чистая прибыль']);
  }

  // Render Comparison Table
  const scenarioTableEl = document.getElementById('scenarioTable');
  if (scenarioTableEl) {
    const rows = [
      ['Выручка (Sales)', rub(baseline.totalSalesRub), rub(opt.totalSalesRub), { html: esc(rub(opt.totalSalesRub - baseline.totalSalesRub)), cls: tone(opt.totalSalesRub - baseline.totalSalesRub) }],
      ['Бюджет (Investment)', rub(baseline.incrementalSalesRub / baseline.roas), rub(opt.incrementalSalesRub / opt.roas), rub((opt.incrementalSalesRub / opt.roas) - (baseline.incrementalSalesRub / baseline.roas))],
      ['Чистая прибыль', rub(baseline.profit), rub(opt.profit), { html: esc(rub(opt.profit - baseline.profit)), cls: tone(opt.profit - baseline.profit) }],
      ['ROAS', baseline.roas, opt.roas, { html: esc(fmt(opt.roas - baseline.roas, 2)), cls: tone(opt.roas - baseline.roas) }],
      ['ROI', pct(baseline.roi), pct(opt.roi), { html: esc(pp(opt.roi - baseline.roi)), cls: tone(opt.roi - baseline.roi) }]
    ];
    table(scenarioTableEl, ['Метрика', 'Сценарий A (Baseline)', 'Сценарий B (Оптимум)', 'Разница (Δ)'], rows);
  }
}
