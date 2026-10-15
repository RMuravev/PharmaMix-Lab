import { PharmaDataStore, store as globalStore } from '../../core/store';
import { pct, fmt, esc, PAL } from '../../utils/math';
import { kpiHtml, drawChart } from '../chartRenderer';
import { generateModelsInsights } from '../../modules/insights-engine/insightsGenerator';
import { compareModelsOnSameTestWindow } from '../../application/services/modelComparisonService';
import { validateTimeSeries } from '../../application/services/timeSeriesValidationService';
import { validatePanelTimeSeries } from '../../application/services/panelTimeSeriesValidationService';

/**
 * Section for Econometric Modeling (MMM).
 * Handles model diagnostics, variable importance, and validation metrics.
 */
export function renderReg(st?: PharmaDataStore): void {
  const storeInstance = st || globalStore;
  const getEl = (id: string) => document.querySelector(`.page.active #${id}`) as any || document.getElementById(id);
  const $ = (id: string) => getEl(id);
  const state = storeInstance.getState();
  const REG = state.reg;
  const brandEl = $('mdBrand') as HTMLSelectElement | null;
  const selectedBrand = brandEl ? brandEl.value : '';

  if (state.isLoadingReg) {
    if ($('mdKpis')) $('mdKpis')!.innerHTML = '<div class="callout">Оценка MMM модели в фоне...</div>';
    return;
  }

  if (!REG || (REG as any).err) {
    if ($('mdKpis')) $('mdKpis')!.innerHTML = `<div class="callout bad">${REG && (REG as any).err ? (REG as any).err : 'Модель не оценена'}</div>`;
    return;
  }

  const rows = selectedBrand ? REG.rows.filter((r: any) => r.brand === selectedBrand) : REG.rows;
  const preds = selectedBrand ? REG.rows.map((r: any, i: number) => r.brand === selectedBrand ? REG.pred[i] : 0).filter((_: any, i: number) => REG.rows[i].brand === selectedBrand) : REG.pred;

  const m = REG.fit.m;
  if ($('mdKpis')) {
    $('mdKpis')!.innerHTML = kpiHtml([
      ['R²', pct(m.r2), 'Скорр. R² ' + pct(m.adjR2)],
      ['MAPE in-sample', pct(REG.mape), 'Ошибка подгонки'],
      ['Наблюдения', rows.length + ' бренд-мес.'],
      ['F-тест', Number.isFinite(m.F) ? fmt(m.F, 1) : '—']
    ]);
  }

  // Coefficient-level inference from the fitted OLS result. Classical and
  // heteroskedasticity-robust (HC-style) p-values are shown separately.
  // These are not HAC/Newey-West errors; temporal dependence still needs care.
  const coefficientNames: string[] = Array.isArray(REG.spec?.names) ? REG.spec.names : [];
  const coefficientRows = (m.beta || []).map((beta: number, i: number) => {
    const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
    const number = (value: unknown, digits = 4) => finite(value) ? value.toLocaleString('ru-RU', { maximumFractionDigits: digits }) : '—';
    const pRobust = m.pR?.[i];
    const ci = m.ci?.[i];
    const significant = finite(pRobust) ? pRobust < 0.05 : false;
    return '<tr><td>' + esc(coefficientNames[i] || ('β' + i)) + '</td><td>' + number(beta) + '</td><td>' + number(m.se?.[i]) + '</td><td>' + number(m.seR?.[i]) + '</td><td>' + number((Number.isFinite(m.seR?.[i]) && m.seR[i] > 0) ? beta / m.seR[i] : NaN) + '</td><td>' + number(pRobust, 5) + '</td><td>' + (finite(pRobust) ? (significant ? '<strong>Да</strong>' : 'Нет') : '—') + '</td><td>' + (Array.isArray(ci) ? number(ci[0]) + ' … ' + number(ci[1]) : '—') + '</td></tr>';
  }).join('');
  if ($('mdInsightsBox')) {
    const oldHtml = $('mdInsightsBox')!.innerHTML;
    $('mdInsightsBox')!.innerHTML = oldHtml + '<section style="margin-top:18px"><h3>Диагностика коэффициентов MMM</h3>' +
      '<p class="small">p-value и стандартная ошибка с поправкой на гетероскедастичность (robust). Доверительный интервал ниже — классический OLS, не robust. Это не HAC/Newey–West; при автокорреляции временных рядов выводы о значимости могут быть ненадёжны.</p>' +
      '<div style="overflow-x:auto"><table class="data-table"><thead><tr><th>Фактор</th><th>β</th><th>SE OLS</th><th>SE robust</th><th>t robust</th><th>p robust</th><th>p&lt;0,05</th><th>95% ДИ OLS</th></tr></thead><tbody>' + coefficientRows + '</tbody></table></div></section>';
  }

  const ap = new Map<string, number>(), mp = new Map<string, number>();
  rows.forEach((r: any, i: number) => {
    mp.set(r.month, (mp.get(r.month) || 0) + (preds[i] || 0));
    ap.set(r.month, (ap.get(r.month) || 0) + r.salesRub);
  });
  const ms: string[] = [...ap.keys()].sort();

  if ($('mdChartDecomp')) {
    drawChart($('mdChartDecomp') as HTMLCanvasElement, [
      { name: 'Фактические продажи', values: ms.map(x => ap.get(x) || 0), color: PAL[0] },
      { name: 'Прогноз MMM', values: ms.map(x => mp.get(x) || 0), color: PAL[1] }
    ], ms);
  }

  if ($('mdChartHill')) {
    const hillK = +(($('mdHill') as HTMLInputElement)?.value || 300);
    const trps = Array.from({ length: 20 }, (_, i: number) => i * 50);
    const hillVals = trps.map((trp: number) => 100 * Math.pow(trp, 1.5) / (Math.pow(hillK, 1.5) + Math.pow(trp, 1.5)));
    drawChart($('mdChartHill') as HTMLCanvasElement, [
      { name: 'Насыщение TRP', values: hillVals, color: PAL[2] }
    ], trps.map((t: number) => `${t} TRP`));
  }

  if ($('mdInsightsBox')) {
    const insights = generateModelsInsights(state);
    $('mdInsightsBox')!.innerHTML = `
      <div style="font-weight:700;font-size:14px;margin-bottom:6px;color:#0f172a;">${insights.title}</div>
      ${insights.html}
    `;
  }
}

export function renderVal(st?: PharmaDataStore): void {
  const storeInstance = st || globalStore;
  const getEl = (id: string) => document.querySelector(`.page.active #${id}`) as any || document.getElementById(id);
  const $ = (id: string) => getEl(id);
  const state = storeInstance.getState();
  const VAL = state.val;
  if (!VAL) {
    if ($('valSplit')) $('valSplit')!.innerHTML = '<div class="small">Запустите временную проверку.</div>';
    return;
  }
  const tr = VAL.trainM;
  if ($('valSplit')) {
    const splitHtml = [
      ['Обучающая выборка', tr[0] + ' — ' + tr[tr.length - 1] + ' (' + tr.length + ' мес.)'],
      ['Тестовая выборка', VAL.testM[0] + ' — ' + VAL.testM[VAL.testM.length - 1] + ' (' + VAL.H + ' мес.)'],
      ['Схема', VAL.scheme === 'fixed' ? 'Фиксированная' : 'Rolling-origin']
    ].map((x: any) => '<div class="statline"><span>' + x[0] + '</span><strong>' + esc(x[1]) + '</strong></div>').join('');

    // Validate the holdout series before interpreting forecast diagnostics.
    // Prefer an explicit period field; otherwise use the validation test-month sequence.
    const modelKeys = VAL.models.map((item: [string, string]) => item[0]);
    const common = VAL.preds.filter((row: any) => Number.isFinite(row.actual) && modelKeys.every((key: string) => Number.isFinite(row[key])));
    const monthlyValidation = new Map<string, { actual: number; predicted: number }>();
    VAL.preds.forEach((row: any) => {
      const period = typeof row.month === 'string' ? row.month : (typeof row.period === 'string' ? row.period : '');
      if (!period) return;
      const current = monthlyValidation.get(period) || { actual: 0, predicted: 0 };
      if (Number.isFinite(row.actual)) current.actual += row.actual;
      else current.actual = Number.NaN;
      const firstModel = modelKeys[0];
      if (firstModel && Number.isFinite(row[firstModel])) current.predicted += row[firstModel];
      else current.predicted = Number.NaN;
      monthlyValidation.set(period, current);
    });
    const validationRows = [...monthlyValidation.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([period, values]) => ({
      period, actual: values.actual, predicted: values.predicted,
    }));
    // OOS predictions are panel rows (currently brand × month). Validate each
    // brand independently; only fall back to the aggregate series if row-level
    // brand identifiers are unavailable in a future validation provider.
    const panelGroups = new Map<string, Map<string, { actual: number; predicted: number }>>();
    for (const row of VAL.preds as any[]) {
      const period = typeof row.month === 'string' ? row.month : (typeof row.period === 'string' ? row.period : '');
      if (!period) continue;
      const brand = typeof row.brand === 'string' && row.brand.trim() ? row.brand.trim() : '';
      if (!brand) continue;
      const groupRows = panelGroups.get(brand) ?? new Map<string, { actual: number; predicted: number }>();
      const current = groupRows.get(period) ?? { actual: 0, predicted: 0 };
      if (Number.isFinite(row.actual)) current.actual += row.actual;
      else current.actual = Number.NaN;
      const firstModel = modelKeys[0];
      if (firstModel && Number.isFinite(row[firstModel])) current.predicted += row[firstModel];
      else current.predicted = Number.NaN;
      groupRows.set(period, current);
      panelGroups.set(brand, groupRows);
    }
    let timeValidationHtml = '';
    let timeSeriesIsValid = true;
    try {
      const minimumObservations = Math.min(VAL.H || 2, 24);
      const report = panelGroups.size > 0
        ? validatePanelTimeSeries({
            observations: [...panelGroups.entries()].flatMap(([group, periods]) => [...periods.entries()].map(([period, values]) => ({ period, actual: values.actual, predicted: values.predicted, group }))),
            minimumObservations,
            requirePredictions: true,
            expectedPeriods: VAL.testM,
          })
        : validateTimeSeries({ observations: validationRows, minimumObservations, requirePredictions: true, expectedPeriods: VAL.testM });
      timeSeriesIsValid = report.valid;
      const issueHtml = report.issues.map((issue: any) => '<li><strong>' + esc(issue.severity.toUpperCase()) + (issue.group ? ' [' + esc(issue.group) + ']' : '') + ':</strong> ' + esc(issue.message) + '</li>').join('');
      const recommendationsHtml = report.recommendations.map((item: string) => '<li>' + esc(item) + '</li>').join('');
      const status = report.valid ? 'Проверка временной структуры пройдена без критических ошибок.' : 'Есть критические ошибки временной структуры; метрики прогноза интерпретировать нельзя до исправления данных.';
      const seriesSummary = panelGroups.size > 0 ? ' Проверено отдельных серий (брендов): ' + panelGroups.size + '.' : ' Проверена агрегированная месячная последовательность: идентификаторы серий недоступны.';
      const rangeSummary = ' Тестовое окно: ' + esc(VAL.testM[0] || '—') + ' — ' + esc(VAL.testM[VAL.testM.length - 1] || '—') + '; ожидаемых месяцев: ' + VAL.testM.length + '.';
      timeValidationHtml = '<section style="margin-top:12px"><h4>Контроль качества временных рядов</h4><p class="small">' + esc(status) + seriesSummary + rangeSummary + '</p>' + (issueHtml ? '<ul>' + issueHtml + '</ul>' : '<p class="small">Критических проблем не обнаружено.</p>') + (recommendationsHtml ? '<details><summary>Рекомендации</summary><ul>' + recommendationsHtml + '</ul></details>' : '') + '</section>';
    } catch (error) {
      timeSeriesIsValid = false;
      timeValidationHtml = '<div class="callout bad">Не удалось проверить временной ряд: ' + esc(error instanceof Error ? error.message : String(error)) + '</div>';
    }
    let comparisonHtml = '<div class="small">Нет общей тестовой выборки с конечными прогнозами для всех моделей.</div>';
    if (common.length > 0 && !timeSeriesIsValid) {
      comparisonHtml = '<div class="callout bad">Сравнение моделей скрыто: сначала исправьте критические ошибки временного ряда.</div>';
    } else if (common.length > 0) {
      try {
        const compared = compareModelsOnSameTestWindow(modelKeys.map((key: string) => ({
          modelId: key,
          testWindowId: VAL.testM.join(','),
          actual: common.map((row: any) => row.actual),
          predicted: common.map((row: any) => row[key]),
        })));
        const names = new Map<string, string>(VAL.models);
        const fmtMetric = (v: number | null) => v === null || !Number.isFinite(v) ? '—' : v.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
        comparisonHtml = '<h4 style="margin:16px 0 8px">Сравнение моделей на общей тестовой выборке</h4>' +
          '<p class="small">Общих наблюдений: ' + common.length + '. Ранжирование по WAPE; при неопределённом WAPE используется RMSE.</p>' +
          '<div style="overflow-x:auto"><table class="data-table"><thead><tr><th>№</th><th>Модель</th><th>MAE</th><th>RMSE</th><th>WAPE, %</th><th>MAPE, %</th><th>R²</th></tr></thead><tbody>' +
          compared.map((item) => '<tr><td>' + item.rank + '</td><td>' + esc(names.get(item.modelId) || item.modelId) + '</td><td>' + fmtMetric(item.diagnostics.mae) + '</td><td>' + fmtMetric(item.diagnostics.rmse) + '</td><td>' + fmtMetric(item.diagnostics.wapePct) + '</td><td>' + fmtMetric(item.diagnostics.mapePct) + '</td><td>' + fmtMetric(item.diagnostics.rSquared) + '</td></tr>').join('') +
          '</tbody></table></div>';
      } catch (error) {
        comparisonHtml = '<div class="callout bad">Не удалось сравнить модели: ' + esc(error instanceof Error ? error.message : String(error)) + '</div>';
      }
    }
    $('valSplit')!.innerHTML = splitHtml + timeValidationHtml + comparisonHtml;
  }
}
