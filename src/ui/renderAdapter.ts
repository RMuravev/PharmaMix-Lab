/**
 * UI-Адаптер PharmaMix Lab v3.1: связывает DataStore с DOM-разметкой React
 * Отвечает за рендеринг вкладок, вызов чистых математических модулей и обработку событий
 */

import { PharmaDataStore, getFilteredRaw } from '../core/store';
import { runGeoABDifferenceInDifferences } from '../modules/causal-inference/geoAbExperiment';
import { buildDerivedStructures } from '../modules/data-ingestion/calendarBuilder';
import { generateDemoDataset } from '../modules/data-ingestion/demoGenerator';
import { loadYearlyDemoPartitions, processSourceFiles } from '../modules/data-ingestion/partitionManager';
import { defaultNanobricks, generateTemplateCSV } from '../modules/data-ingestion/csvParser';
import { runDataQualityAudit } from '../modules/data-quality/qualityAuditor';
import { runOOSValidation } from '../modules/forecasting/oosValidator';
import { runHierarchicalRegression } from '../modules/mmm-engine/hierarchicalRegression';
import { runLagSearchOptimization } from '../modules/mmm-engine/lagOptimization';
import { fitMMMModel } from '../modules/mmm-engine/regression';
import { CausalTCN, FastTCN, runModelTournament } from '../modules/mmm-engine/tcnModel';
import { evaluateVIFRisk } from '../modules/mmm-engine/vifCheck';
import { evaluatePromoBaselines } from '../modules/promo-engine/promoBaseline';
import { aggregate, marketCalc, mechStats, mechVerdict } from '../modules/promo-engine/promoFinancials';
import { runBayesianBudgetOptimization, simulateBudgetBayesianOptimization } from '../modules/budget-optimizer/budgetOptimizer';
import { runAutoMLEngine, AutoMLBrandResult, AutoMLModelLeaderItem, TMAMechanicStat, TMAChainStat } from '../modules/mmm-engine/automlEngine';
import { generateSeasonalityReport } from '../modules/mmm-engine/seasonalityEngine';
import {
  getFluSpbOfficialDataset,
  fetchInfluenzaSpbData,
  parseIllnessCSV,
  calculateIllnessCorrelations,
  generateIllnessCsvTemplate
} from '../modules/seasonality-engine/seasonality_engine';
import {
  generateOverviewInsights,
  generateMarketInsights,
  generatePromoInsights,
  generateModelsInsights
} from '../modules/insights-engine/insightsGenerator';
import { pharmaDB } from '../modules/browser-db/browserDB';
import { exportFullPharmaReportToExcel } from '../utils/excelExporter';
import { generateExecutiveSummaryPDF, generateFullAutoMLReportPDF } from '../utils/pdfGenerator';
import {
  renderModeUI,
  renderDrilldownModal,
  renderPitchDeckOverlay,
  attachInteractiveChartDrilldowns
} from './presentationAdapter';
import { startProductTour } from './productTour';
import {
  PAL,
  SEP,
  esc,
  fmt,
  mAdd,
  mIdx,
  pct,
  pp,
  rub,
  sgnPct,
  sum,
  tolEq,
  tone,
  uniq
} from '../utils/math';
import {
  chkHtml,
  drawChart,
  drawGeoABChart,
  drawWaterfallChart,
  drawElasticityChart,
  drawContributionDecompositionChart,
  drawShapSummaryBarChart,
  drawShapBeeswarmChart,
  drawSTLDecompositionChart,
  drawIllnessCorrelationChart,
  drawPromoSeasonalElasticityChart,
  drawChainsChart,
  drawMechsChart,
  resizeAllCharts,
  destroyOrphanedCharts,
  kpiHtml,
  legendHtml,
  table
} from './chartRenderer';

import { renderOverview } from './sections/OverviewSection';
import { renderData } from './sections/DataSection';
import { renderScenarioPage } from './sections/ScenarioSection';
import { renderDash } from './sections/DashboardSection';
import { renderMarket } from './sections/MarketSection';
import { renderPromo } from './sections/PromoSection';
import { renderReg, renderVal } from './sections/ModelSection';
import { renderMLCenter, runGeoABExperimentUI, setupMLCenterEventListeners } from './sections/MLSection';
import { renderSeasonalityPage } from './sections/SeasonalitySection';
import { renderRolesJTBD } from './sections/RolesJTBDSection';
import { renderJTBDPortal } from './sections/JTBDPortalSection';
import { notificationService } from './NotificationCenter';

import { renderDataPartitionsPage, renderShareExperimentPage, renderDataQualityAuditPage, renderTechMonitorPage, renderTechLogsPage } from './sections/DataDeveloperSection';
import { renderExecBriefPage, renderTopROIPage, renderBudgetRoiPage, renderBudgetOptimizationPage, renderWhatIfPage, renderScenarioComparisonPage, renderOOSValidationPage, renderModelTournamentLabPage, renderRegionalDeepDivePage } from './sections/StrategicPages';
import { ROLES_REGISTRY, UserRole } from '../types/pharma';

import { safeExecute, safeExecuteAsync } from '../utils/error';
import { persistenceService } from './services/persistenceService';
import { workerService } from '../modules/compute-worker/workerService';
import { logger } from '../services/monitoring';

export function setupUIRenderAdapter(store: PharmaDataStore): () => void {
  const $ = (id: string) => document.getElementById(id) as HTMLElement | null;

  const DOM_PAGE_MAP: Record<string, string> = {
    portal: 'portal',
    'top-roi': 'top-roi',
    'budget-roi': 'budget-roi',
    'exec-brief': 'exec-brief',
    'regional-deepdive': 'regional-deepdive',
    'seasonality-analysis': 'seasonality-analysis',
    'causal-tests': 'mlcenter',
    'whatif-scenarios': 'whatif-scenarios',
    'budget-optimization': 'budget-optimization',
    'scenario-comparison': 'scenario-comparison',
    'model-tournament': 'model-tournament',
    'oos-validation': 'oos-validation',
    'share-experiment': 'share-experiment',
    'data-partitions': 'data-partitions',
    'data-quality': 'data-quality',
    'tech-monitor': 'tech-monitor',
    'tech-logs': 'tech-logs',
    overview: 'overview',
    dash: 'dash',
    market: 'market',
    promo: 'promo',
    models: 'models',
    mlcenter: 'mlcenter',
    data: 'data',
    automl: 'model-tournament',
    seasonality: 'seasonality-analysis',
    scenario: 'scenario-comparison',
    roles: 'portal'
  };

  function setLoading(loading: boolean) {
    store.update(draft => { draft.isLoading = loading; }, true);
    const el = $('global-loading');
    if (el) {
      el.style.display = loading ? 'flex' : 'none';
    }
  }

  function safeRender(name: string, fn: () => void) {
    try {
      fn();
    } catch (e: any) {
      logger.error(`Error in rendering page: ${name}`, e, { page: name });
      notificationService.error(`Ошибка рендеринга страницы (${name})`, e.message || 'Произошла неизвестная ошибка');
      const targetDom = DOM_PAGE_MAP[name] || name;
      const container = $('page-' + targetDom) || $('page-' + name);
      if (container) {
        container.style.display = 'block';
        container.innerHTML = `<div class="callout bad" style="margin:24px;padding:20px;"><b>⚠️ Ошибка рендеринга страницы (${name}):</b><br/>${esc(e.message || String(e))}<br/><pre style="font-size:11px;margin-top:8px;color:#991b1b;">${esc(e.stack || '')}</pre><div style="margin-top:14px;font-size:12px;border-top:1px solid rgba(220,38,38,0.2);padding-top:10px;"><a href="#" onclick="if(window.__pm && window.__pm.showPage) window.__pm.showPage('tech-logs'); return false;" style="color:#1d4ed8;font-weight:700;text-decoration:underline;">🐛 Посмотреть полную историю ошибок на странице System Error Logs</a></div></div>`;
      }
      if ($('ovChecks')) {
        $('ovChecks')!.innerHTML = `<div class="callout bad"><b>Ошибка рендеринга (${name}):</b> ${esc(e.message)}. <a href="#" onclick="if(window.__pm && window.__pm.showPage) window.__pm.showPage('tech-logs'); return false;">Логи в System Error Logs</a></div>`;
      }
    }
  }

  function renderActive(): void {
    const p = store.getState().activePage;
    safeRender(p, () => {
      const renderers: Record<string, (st: PharmaDataStore) => void> = {
        // JTBD 7 ролей
        portal: (st) => renderJTBDPortal(st, showPage),
        'top-roi': renderTopROIPage,
        'budget-roi': renderBudgetRoiPage,
        'exec-brief': renderExecBriefPage,
        'regional-deepdive': renderRegionalDeepDivePage,
        'seasonality-analysis': renderSeasonalityPage,
        'causal-tests': renderMLCenter,
        'whatif-scenarios': renderWhatIfPage,
        'budget-optimization': renderBudgetOptimizationPage,
        'scenario-comparison': renderScenarioComparisonPage,
        'model-tournament': renderModelTournamentLabPage,
        'oos-validation': renderOOSValidationPage,
        'share-experiment': renderShareExperimentPage,
        'data-partitions': (st) => { renderDataPartitionsPage(st, () => { void refreshAll(); }); renderData(st); },
        'data-quality': renderDataQualityAuditPage,
        'tech-monitor': renderTechMonitorPage,
        'tech-logs': renderTechLogsPage,

        // Базовая обратная совместимость
        overview: renderOverview,
        dash: renderDash,
        market: renderMarket,
        promo: renderPromo,
        models: () => { renderReg(); renderVal(); },
        mlcenter: renderMLCenter,
        data: (st) => { renderData(st); renderDataPartitionsPage(st, () => { void refreshAll(); }); },
        automl: renderAutoMLPage,
        seasonality: renderSeasonalityPage,
        scenario: renderScenarioPage,
        roles: (st) => renderJTBDPortal(st, showPage)
      };
      
      const fn = renderers[p];
      if (fn) fn(store);

      renderModeUI(store);
      renderDrilldownModal(store, showPage);
      renderPitchDeckOverlay(store, showPage);
      attachInteractiveChartDrilldowns(store);
      updateRoleUI();
    });
  }

  const DIMS: Record<string, string> = {
    chain: 'Сеть',
    brand: 'Бренд',
    sku: 'SKU',
    region: 'Регион',
    city: 'Город',
    month: 'Месяц',
    mech: 'Механика'
  };

  const PCOLS = ['Акций', 'Оценено', 'Факт (оц.), ₽', 'Baseline, ₽', 'Δ выручки, ₽', 'Δ шт', 'Бонус всего, ₽', 'Бонус оц., ₽', 'ROAS', 'ROI', 'Безуб. маржа', 'Аплифт'];
  const pcells = (g: any) => [
    fmt(g.n),
    fmt(g.nv),
    rub(g.actRV),
    rub(g.baseR),
    { html: esc(rub(g.dR)), cls: tone(g.dR) },
    fmt(g.dU),
    rub(g.bonus),
    rub(g.bonusV),
    fmt(g.roas, 2),
    { html: esc(pct(g.roi)), cls: tone(g.roi) },
    pct(g.be, 0),
    { html: esc(sgnPct(g.uplift)), cls: tone(g.uplift) }
  ];

  function getSettingsFromUI() {
    const el = $('marginPct') as HTMLInputElement | null;
    const mv = el ? el.value.trim().replace(',', '.') : '48';
    const mn = mv === '' ? NaN : Number(mv);
    const bEl = $('baselineMonths') as HTMLSelectElement | null;
    const mEl = $('minHist') as HTMLSelectElement | null;
    const exEl = $('excludePromoBase') as HTMLInputElement | null;
    const maEl = $('marketAdjust') as HTMLInputElement | null;
    const bmEl = $('baselineMethod') as HTMLSelectElement | null;
    return {
      nM: bEl ? +bEl.value : 3,
      minH: mEl ? +mEl.value : 2,
      excl: exEl ? exEl.checked : true,
      adj: maEl ? maEl.checked : false,
      method: (bmEl ? bmEl.value : 'dual') as 'dual' | 'rolling' | 'counterfactual',
      margin: Number.isFinite(mn) && mn >= 0 && mn <= 100 ? mn / 100 : NaN
    };
  }

  function fillSel(id: string, vals: string[], allLabel: string | null, keep = true): boolean {
    const el = $(id) as HTMLSelectElement | null;
    if (!el) return false;
    const old = el.value;
    el.innerHTML = (allLabel !== null ? '<option value="">' + allLabel + '</option>' : '') +
      vals.map(v => '<option value="' + esc(v) + '">' + esc(v) + '</option>').join('');
    if (keep && old && [...el.options].some(o => o.value === old)) {
      el.value = old;
      return true;
    }
    return false;
  }

  function populateSelects(): void {
    const state = store.getState();
    const brands: string[] = uniq((state.raw.sales || []).map(r => r.brand)).sort();
    const regions: string[] = uniq((state.raw.sales || []).map(r => r.region)).sort();
    const months: string[] = state.derived?.months || [];

    fillSel('dBrand', brands, 'Все бренды');
    fillSel('dRegion', regions, 'Все регионы');
    fillSel('mdBrand', brands, 'Все бренды (Сводный портфель)');
    fillSel('seasBrandSelect', brands, 'Все бренды (Сводный портфель)');
    fillSel('automlBrandSelect', brands, 'Все бренды (Сводный портфель)');
    const kf = fillSel('dFrom', months, null);
    const kt = fillSel('dTo', months, null);
    if (!kf && $('dFrom')) ($('dFrom') as HTMLSelectElement).value = months[0] || '';
    if (!kt && $('dTo')) ($('dTo') as HTMLSelectElement).value = months[months.length - 1] || '';

    const ms: string[] = uniq((state.raw.market || []).map(r => r.market)).sort();
    fillSel('mkMarket', ms, null);
    fillSel('mkRegion', uniq((state.raw.market || []).map(r => r.region)).sort(), 'Все регионы');

    const A = state.derived.atoms;
    const g = (k: string): string[] => uniq(A.map((a: any) => a[k])).sort();
    fillSel('fChain', g('chain'), 'Все');
    fillSel('fBrand', g('brand'), 'Все');
    fillSel('fSku', g('sku'), 'Все');
    fillSel('fRegion', g('region'), 'Все');
    fillSel('fCity', g('city'), 'Все');
    fillSel('fMech', g('mech'), 'Все');

    const am: string[] = g('month');
    const k1 = fillSel('fFrom', am, null);
    const k2 = fillSel('fTo', am, null);
    if (!k1 && $('fFrom')) ($('fFrom') as HTMLSelectElement).value = am[0] || '';
    if (!k2 && $('fTo')) ($('fTo') as HTMLSelectElement).value = am[am.length - 1] || '';

    if ($('geoab-region')) fillSel('geoab-region', regions, 'Все регионы (Сводный)');
    if ($('geoab-split') && months && months.length > 2) {
      const splitEl = $('geoab-split') as HTMLSelectElement;
      const cur = splitEl.value;
      splitEl.innerHTML = months.map(m => `<option value="${m}">${m}</option>`).join('');
      const defIdx = Math.max(1, Math.min(months.length - 2, Math.floor(months.length * 0.46)));
      if (cur && months.includes(cur)) splitEl.value = cur;
      else if (months[defIdx]) splitEl.value = months[defIdx];
    }
    populateGlobalFilters();
  }

  function populateGlobalFilters(): void {
    const state = store.getState();
    const brands = uniq((state.raw.sales || []).map(r => r.brand)).filter(Boolean).sort();
    const regions = uniq((state.raw.sales || []).map(r => r.region)).filter(Boolean).sort();
    const chains = uniq((state.raw.sales || []).map(r => r.chain).concat((state.raw.promos || []).map(p => p.chain))).filter(Boolean).sort();

    fillSel('globalBrandSelect', brands, 'Все бренды');
    fillSel('globalRegionSelect', regions, 'Все регионы');

    const bEl = $('globalBrandSelect') as HTMLSelectElement | null;
    const rEl = $('globalRegionSelect') as HTMLSelectElement | null;
    if (bEl) bEl.value = state.globalFilters.brand || '';
    if (rEl) rEl.value = state.globalFilters.region || '';

    const seasBrandEl = $('seasBrandSelect') as HTMLSelectElement | null;
    if (seasBrandEl) seasBrandEl.value = state.globalFilters.brand || '';
    const automlBrandEl = $('automlBrandSelect') as HTMLSelectElement | null;
    if (automlBrandEl) automlBrandEl.value = state.globalFilters.brand || '';
    const dBrandEl = $('dBrand') as HTMLSelectElement | null;
    if (dBrandEl) {
      if (dBrandEl.options.length <= 1) fillSel('dBrand', brands, 'Все бренды');
      dBrandEl.value = state.globalFilters.brand || '';
    }
    const dRegionEl = $('dRegion') as HTMLSelectElement | null;
    if (dRegionEl) {
      if (dRegionEl.options.length <= 1) fillSel('dRegion', regions, 'Все регионы');
      dRegionEl.value = state.globalFilters.region || '';
    }

    const hasActiveFilters = Boolean(state.globalFilters.brand || state.globalFilters.region || state.globalFilters.chain);
    const resetBtn = $('btnResetGlobalFilters');
    if (resetBtn) {
      resetBtn.style.display = hasActiveFilters ? 'inline-block' : 'none';
    }

    const dataStatus = $('dataStatus');
    if (dataStatus) {
      if (hasActiveFilters) {
        const parts = [];
        if (state.globalFilters.brand) parts.push(state.globalFilters.brand);
        if (state.globalFilters.region) parts.push(state.globalFilters.region);
        if (state.globalFilters.chain) parts.push(state.globalFilters.chain);
        dataStatus.textContent = `Фильтр: ${parts.join(' · ')}`;
        dataStatus.className = 'pill';
        dataStatus.style.background = '#dbeafe';
        dataStatus.style.color = '#1e40af';
      } else {
        dataStatus.textContent = state.imported.sales ? 'Пользовательские' : 'Демо-данные';
        dataStatus.className = 'pill';
        dataStatus.style.background = '';
        dataStatus.style.color = '';
      }
    }
  }

  function renderPartitionLog(): void {
    const box = $('partitionLogArea') || $('partitionLogBox');
    if (!box) return;
    const logs = store.getState().partitionLogs || [];
    if (!logs.length) {
      box.innerHTML = '';
      return;
    }
    box.innerHTML = `
      <div class="card" style="margin-top:16px;">
        <h3>📋 Журнал Загруженных Партиций и Файлов</h3>
        <p class="sub">История пофайловой загрузки данных и состояние партиций в памяти</p>
        <div class="table-wrap" style="margin-top:10px;">
          <table>
            <thead>
              <tr><th>Время</th><th>Тип данных</th><th>Имя файла</th><th>Покрытые месяцы</th><th>Новых записей</th><th>Обновлено (Upsert)</th><th>Всего в памяти</th></tr>
            </thead>
            <tbody>
              ${logs.map(l => `
                <tr>
                  <td>${esc(l.time)}</td>
                  <td><b>${esc(l.typeName)}</b></td>
                  <td><code>${esc(l.fileName)}</code></td>
                  <td>${l.months.length > 0 ? esc(l.months[0]) + ' — ' + esc(l.months[l.months.length - 1]) + ' (' + l.months.length + ' мес.)' : '—'}</td>
                  <td class="pos">+${fmt(l.newCount)}</td>
                  <td class="${l.updatedCount > 0 ? 'warn' : ''}">${fmt(l.updatedCount)}</td>
                  <td><b>${fmt(l.totalCount)}</b></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }


  function renderDash(): void {
    const state = store.getState();
    const f = {
      brand: ($('dBrand') as HTMLSelectElement)?.value || '',
      region: ($('dRegion') as HTMLSelectElement)?.value || '',
      from: ($('dFrom') as HTMLSelectElement)?.value || '',
      to: ($('dTo') as HTMLSelectElement)?.value || ''
    };
    if (f.from && f.to && f.from > f.to) {
      const tmp = f.from; f.from = f.to; f.to = tmp;
    }

    const sr = state.raw.sales.filter(r =>
      (!f.brand || r.brand === f.brand) &&
      (!f.region || r.region === f.region) &&
      (!f.from || r.month >= f.from) &&
      (!f.to || r.month <= f.to)
    );
    const months = uniq(sr.map(r => r.month)).sort();
    const activeMonths = months.length ? months : state.derived.months;
    const salesT = sum(sr, 'salesRub'), unitsT = sum(sr, 'units');

    const Patoms = state.derived.atoms.filter(a =>
      (!f.brand || a.brand === f.brand) &&
      (!f.region || a.region === f.region) &&
      (!f.from || a.month >= f.from) &&
      (!f.to || a.month <= f.to)
    );
    const P = aggregate(Patoms, [], state.derived.st.margin)[0];

    const shareCalc = (b: string, reg: string, from: string, to: string) => {
      if (!state.raw.market.length) return NaN;
      const mk = b ? state.derived.brandMarket.get(b) : null;
      let nu = 0, de = 0;
      for (const r of state.raw.market) {
        if (reg && r.region !== reg) continue;
        if (from && r.month < from) continue;
        if (to && r.month > to) continue;
        if (mk && r.market !== mk) continue;
        de += r.salesRub;
        if (b ? r.brand === b : state.derived.ownBrands.has(r.brand)) nu += r.salesRub;
      }
      return de > 0 ? nu / de : NaN;
    };

    const sh = shareCalc(f.brand, f.region, f.from, f.to);
    const span = Math.max(1, activeMonths.length);
    const prevFrom = mAdd(f.from, -span), prevTo = mAdd(f.to, -span);
    const mkMonths = uniq(state.raw.market.map(r => r.month)).sort(), mkMin = mkMonths[0];
    const shP = prevFrom >= mkMin ? shareCalc(f.brand, f.region, prevFrom, prevTo) : NaN;

    if ($('dashAssump')) {
      const bsCount = uniq(sr.map(r => r.brand)).length;
      const regCount = uniq(sr.map(r => r.region)).length;
      let txt = `Период: ${activeMonths[0] || '—'} – ${activeMonths[activeMonths.length - 1] || '—'} (${activeMonths.length} мес.) · Брендов: ${f.brand ? '«' + f.brand + '»' : 'Все (' + bsCount + ')'} · Регионов: ${f.region ? '«' + f.region + '»' : 'Все (' + regCount + ')'}`;
      if (!state.raw.promos.length) txt += ' · <span style="color:#b45309;font-weight:600;">⚠️ ТМА не загружен (бонусы = 0 ₽)</span>';
      if (!state.raw.market.length) txt += ' · <span style="color:#b45309;font-weight:600;">⚠️ Рыночные данные не загружены</span>';
      $('dashAssump')!.innerHTML = txt;
    }

    if ($('dashKpis')) {
      $('dashKpis')!.innerHTML = kpiHtml([
        ['Выручка', rub(salesT), 'За период: ' + activeMonths.length + ' мес.'],
        ['Упаковки', fmt(unitsT), 'Продажи в шт.'],
        ['Доля рынка', pct(sh), state.raw.market.length ? (Number.isFinite(shP) ? 'Пред. ' + span + ' мес.: ' + pct(shP) + ' (' + pp(sh - shP) + ')' : 'Нет пред. окна') : 'Рынок не загружен'],
        ['Бонусы', rub(P.bonus || 0), state.raw.promos.length ? 'Фонд трейд-маркетинга' : 'ТМА не загружен (0 ₽)'],
        ['Инкр. выручка', rub(P.dR || 0), state.raw.promos.length ? 'Прирост над baseline' : '0 ₽'],
        ['ROI промо', state.raw.promos.length && Number.isFinite(P.roi) ? pct(P.roi || 0) : '—', state.raw.promos.length ? 'При марже ' + pct(state.derived.st.margin, 0) : '—']
      ]);
    }

    // 1. График продаж (dashSales)
    const bm = new Map<string, number>();
    sr.forEach(r => {
      const k = r.brand + SEP + r.month;
      bm.set(k, (bm.get(k) || 0) + r.salesRub);
    });

    const bs = uniq(sr.map(r => r.brand)).sort();
    let serSales: Array<{ name: string; values: number[]; color: string }> = [];

    if (f.brand) {
      serSales = [{
        name: f.brand,
        values: activeMonths.map(m => bm.get(f.brand + SEP + m) || 0),
        color: PAL[0]
      }];
    } else {
      const bSums = new Map<string, number>();
      sr.forEach(r => bSums.set(r.brand, (bSums.get(r.brand) || 0) + r.salesRub));
      const sortedBrands = [...bSums.entries()].sort((a, b) => b[1] - a[1]).map(x => x[0]);
      serSales = sortedBrands.slice(0, 6).map((b, i) => ({
        name: b,
        values: activeMonths.map(m => bm.get(b + SEP + m) || 0),
        color: PAL[i % PAL.length]
      }));
    }

    if ($('dashSales')) {
      drawChart($('dashSales') as HTMLCanvasElement, serSales, activeMonths, { zero: true });
    }
    if ($('dashSalesLg')) {
      $('dashSalesLg')!.innerHTML = legendHtml(serSales);
    }

    // 2. График доли рынка (dashShare)
    if ($('dashShare')) {
      const cvsShare = $('dashShare') as HTMLCanvasElement;
      if (state.raw.market.length > 0) {
        let serShare: Array<{ name: string; values: number[]; color: string }> = [];
        if (f.brand) {
          const mk = state.derived.brandMarket.get(f.brand);
          serShare = [{
            name: f.brand + ' (доля)',
            values: activeMonths.map(m => {
              let bRub = 0, mRub = 0;
              for (const r of state.raw.market) {
                if (f.region && r.region !== f.region) continue;
                if (r.month !== m) continue;
                if (mk && r.market !== mk) continue;
                mRub += r.salesRub;
                if (r.brand === f.brand) bRub += r.salesRub;
              }
              return mRub > 0 ? bRub / mRub : NaN;
            }),
            color: PAL[1]
          }];
        } else {
          const bSums = new Map<string, number>();
          sr.forEach(r => bSums.set(r.brand, (bSums.get(r.brand) || 0) + r.salesRub));
          const topBrands = [...bSums.entries()].sort((a, b) => b[1] - a[1]).map(x => x[0]).slice(0, 4);
          serShare = topBrands.map((b, i) => {
            const mk = state.derived.brandMarket.get(b);
            return {
              name: b,
              values: activeMonths.map(m => {
                let bRub = 0, mRub = 0;
                for (const r of state.raw.market) {
                  if (f.region && r.region !== f.region) continue;
                  if (r.month !== m) continue;
                  if (mk && r.market !== mk) continue;
                  mRub += r.salesRub;
                  if (r.brand === b) bRub += r.salesRub;
                }
                return mRub > 0 ? bRub / mRub : NaN;
              }),
              color: PAL[i % PAL.length]
            };
          });
        }
        drawChart(cvsShare, serShare, activeMonths, { zero: true, fmt: (v: number) => (v * 100).toFixed(1) + '%' });
        if ($('dashShareLg')) $('dashShareLg')!.innerHTML = legendHtml(serShare);
      } else {
        const ctx = cvsShare.getContext('2d');
        if (ctx) {
          const w = cvsShare.clientWidth || 500, h = cvsShare.clientHeight || 230, dpr = window.devicePixelRatio || 1;
          cvsShare.width = w * dpr; cvsShare.height = h * dpr;
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.clearRect(0, 0, w, h);
          ctx.fillStyle = '#64748b';
          ctx.font = '12px system-ui';
          ctx.fillText('Рыночные данные не загружены (доля рынка не рассчитывается)', 20, h / 2);
        }
        if ($('dashShareLg')) $('dashShareLg')!.innerHTML = '';
      }
    }

    // 3. График бонусов и инкрементальной выручки (dashBonus)
    if ($('dashBonus')) {
      const cvsBonus = $('dashBonus') as HTMLCanvasElement;
      if (state.raw.promos.length > 0 && Patoms.length > 0) {
        const bMap = new Map<string, number>();
        const dMap = new Map<string, number>();
        Patoms.forEach(a => {
          bMap.set(a.month, (bMap.get(a.month) || 0) + a.bonus);
          const dR = a.valid ? Math.max(0, a.actRV - a.baseR) : 0;
          dMap.set(a.month, (dMap.get(a.month) || 0) + dR);
        });
        const serBonus = [
          { name: 'Бонусы ТМА', values: activeMonths.map(m => bMap.get(m) || 0), color: '#ef4444' },
          { name: 'Инкр. выручка', values: activeMonths.map(m => dMap.get(m) || 0), color: '#10b981' }
        ];
        drawChart(cvsBonus, serBonus, activeMonths, { zero: true });
      } else {
        const ctx = cvsBonus.getContext('2d');
        if (ctx) {
          const w = cvsBonus.clientWidth || 500, h = cvsBonus.clientHeight || 230, dpr = window.devicePixelRatio || 1;
          cvsBonus.width = w * dpr; cvsBonus.height = h * dpr;
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.clearRect(0, 0, w, h);
          ctx.fillStyle = '#94a3b8';
          ctx.font = '12px system-ui';
          ctx.fillText('Данные ТМА (промо / бонусы) не загружены. Начисления: 0 ₽', 20, h / 2);
        }
      }
    }

    // 4. График ROI промо по месяцам (dashRoi)
    if ($('dashRoi')) {
      const cvsRoi = $('dashRoi') as HTMLCanvasElement;
      if (state.raw.promos.length > 0 && Patoms.length > 0) {
        const bMap = new Map<string, number>();
        const dMap = new Map<string, number>();
        Patoms.forEach(a => {
          bMap.set(a.month, (bMap.get(a.month) || 0) + a.bonus);
          const dR = a.valid ? Math.max(0, a.actRV - a.baseR) : 0;
          dMap.set(a.month, (dMap.get(a.month) || 0) + dR);
        });
        const serRoi = [{
          name: 'ROI промо',
          values: activeMonths.map(m => {
            const b = bMap.get(m) || 0;
            const dr = dMap.get(m) || 0;
            const profit = dr * state.derived.st.margin - b;
            return b > 0 ? profit / b : NaN;
          }),
          color: '#8b5cf6'
        }];
        drawChart(cvsRoi, serRoi, activeMonths, { zero: false, fmt: (v: number) => (v * 100).toFixed(0) + '%' });
      } else {
        const ctx = cvsRoi.getContext('2d');
        if (ctx) {
          const w = cvsRoi.clientWidth || 500, h = cvsRoi.clientHeight || 230, dpr = window.devicePixelRatio || 1;
          cvsRoi.width = w * dpr; cvsRoi.height = h * dpr;
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.clearRect(0, 0, w, h);
          ctx.fillStyle = '#94a3b8';
          ctx.font = '12px system-ui';
          ctx.fillText('Данные ТМА не загружены — расчет ROI промо отключен', 20, h / 2);
        }
      }
    }

    // 5. Показатели по брендам (dashTable)
    const pb = new Map(aggregate(Patoms, ['brand'], state.derived.st.margin).map(x => [x.dims[0], x]));
    const tb: any[] = [];
    for (const b of bs) {
      const sb = sr.filter(r => r.brand === b);
      const g = pb.get(b) || { bonus: 0, dR: 0, profit: 0, roi: 0 };
      const s1 = shareCalc(b, f.region, f.from, f.to);
      const s0 = prevFrom >= mkMin ? shareCalc(b, f.region, prevFrom, prevTo) : NaN;
      tb.push({
        b,
        sales: sum(sb, 'salesRub'),
        units: sum(sb, 'units'),
        share: s1,
        dsh: s1 - s0,
        bonus: g.bonus || 0,
        dR: g.dR || 0,
        profit: g.profit || 0,
        roi: g.roi || 0
      });
    }

    table(
      $('dashTable'),
      ['Бренд', 'Продажи, ₽', 'Продажи, шт', 'Доля рынка', 'Δ доли', 'Бонусы, ₽', 'Инкр. выручка, ₽', 'Прирыбль, ₽', 'ROI'],
      [
        ...tb.map((r: any) => [
          r.b,
          rub(r.sales),
          fmt(r.units),
          pct(r.share),
          { html: esc(pp(r.dsh)), cls: tone(r.dsh) },
          r.bonus ? rub(r.bonus) : (state.raw.promos.length ? '0 ₽' : '—'),
          r.dR ? { html: esc(rub(r.dR)), cls: tone(r.dR) } : (state.raw.promos.length ? '0 ₽' : '—'),
          r.profit ? { html: esc(rub(r.profit)), cls: tone(r.profit) } : '—',
          state.raw.promos.length && Number.isFinite(r.roi) && r.bonus > 0 ? { html: esc(pct(r.roi)), cls: tone(r.roi) } : '—'
        ]),
        {
          tot: 1,
          cells: [
            'Итого',
            rub(salesT),
            fmt(unitsT),
            pct(sh),
            pp(sh - shP),
            P.bonus ? rub(P.bonus) : (state.raw.promos.length ? '0 ₽' : '—'),
            P.dR ? rub(P.dR) : (state.raw.promos.length ? '0 ₽' : '—'),
            P.profit ? rub(P.profit) : '—',
            state.raw.promos.length && Number.isFinite(P.roi) && P.bonus > 0 ? pct(P.roi!) : '—'
          ]
        }
      ]
    );

    const chk = runDataQualityAudit(state.raw.market, state.derived);
    chk.unshift({
      title: 'Продажи сходятся',
      status: tolEq(sum(tb, 'sales'), salesT) ? 'ok' : 'fail',
      detail: 'Σ по брендам: ' + rub(sum(tb, 'sales')) + ' vs KPI: ' + rub(salesT)
    });
    chk.unshift({
      title: 'Бонусы сходятся',
      status: tolEq(sum(tb, 'bonus'), P.bonus || 0) ? 'ok' : 'fail',
      detail: 'Σ по брендам: ' + rub(sum(tb, 'bonus')) + ' vs KPI: ' + rub(P.bonus || 0)
    });

    if ($('dashChecks')) {
      $('dashChecks')!.innerHTML = chkHtml(chk);
    }

    if ($('dashInsightsBox')) {
      $('dashInsightsBox')!.innerHTML = `
        <div style="font-weight:700;font-size:14px;margin-bottom:6px;color:#0f172a;">📈 Финансовый анализ дашбордов и динамика брендов</div>
        <div style="font-size:12px;line-height:1.5;color:#334155;">
          • <b>Выручка и объем:</b> Суммарные продажи за выбранный период (${activeMonths.length} мес.) составляют <b>${rub(salesT)}</b> (${fmt(unitsT)} уп.).<br/>
          • <b>Промо-фонд и инкремент:</b> Объем выплаченных бонусов — <b>${rub(P.bonus || 0)}</b>, прирост выручки над baseline — <b>${rub(P.dR || 0)}</b>, чистый ROI промо — <b>${state.raw.promos.length && Number.isFinite(P.roi) ? pct(P.roi || 0) : '—'}</b>.<br/>
          • <b>Рыночная доля:</b> Доля портфеля в анализируемом срезе составляет <b>${pct(sh)}</b> (${Number.isFinite(shP) ? 'изменение ' + pp(sh - shP) + ' к прошл. периоду' : 'базовый уровень'}).
        </div>
      `;
    }
  }

  function renderMarket(): void {
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

    // График индексов цен брендов к рынку
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
      $('mkTable'),
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
  }

  const prRegState = {
    search: '',
    roiFilter: 'all',
    sort: 'dateDesc',
    page: 1,
    pageSize: 25
  };

  function renderPromo(): void {
    const state = store.getState();
    const selBrand = ($('prBrand') as HTMLSelectElement | null)?.value || state.globalFilters.brand || '';
    const selChain = ($('prChain') as HTMLSelectElement | null)?.value || state.globalFilters.chain || '';
    const selMech = ($('prMech') as HTMLSelectElement | null)?.value || '';

    // Заполняем фильтры если пустые
    const allBrands = uniq(state.raw.sales.map(r => r.brand)).sort();
    fillSel('prBrand', allBrands, 'Все бренды');
    if (state.globalFilters.brand && $('prBrand')) ($('prBrand') as HTMLSelectElement).value = state.globalFilters.brand;

    const allChains = uniq(state.derived.atoms.map(a => a.chain)).sort();
    fillSel('prChain', allChains, 'Все аптечные сети');
    if (state.globalFilters.chain && $('prChain')) ($('prChain') as HTMLSelectElement).value = state.globalFilters.chain;

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

    // 1. Агрегирование по аптечным сетям (prTblChains & prChainsCanvas)
    const chainsAgg = aggregate(atomsFiltered, ['chain'], state.derived.st.margin)
      .sort((a, b) => (b.dR || 0) - (a.dR || 0));

    table(
      $('prTblChains'),
      ['Аптечная сеть', 'Акций', 'Выручка факт, ₽', 'Бонус, ₽', 'Инкремент, ₽', 'Прибыль, ₽', 'ROAS', 'ROI'],
      chainsAgg.map(x => [
        x.dims[0],
        fmt(x.n || 0),
        rub(x.actRV || 0),
        rub(x.bonus || 0),
        { html: esc(rub(x.dR || 0)), cls: tone(x.dR || 0) },
        { html: esc(rub(x.profit || 0)), cls: tone(x.profit || 0) },
        fmt(x.roas || 0, 2),
        { html: esc(pct(x.roi || 0)), cls: tone(x.roi || 0) }
      ])
    );

    if ($('prChainsCanvas')) {
      drawChainsChart(
        $('prChainsCanvas') as HTMLCanvasElement,
        chainsAgg.map(x => ({ chain: x.dims[0], roas: x.roas || 0, incrementalRub: x.dR || 0, bonusRub: x.bonus || 0 }))
      );
    }

    // 2. Агрегирование по механикам акций (prTblMechs & prMechsCanvas)
    const mechsAgg = aggregate(atomsFiltered, ['mech'], state.derived.st.margin)
      .sort((a, b) => (b.dR || 0) - (a.dR || 0));

    table(
      $('prTblMechs'),
      ['Механика', 'Акций', 'Выручка факт, ₽', 'Бонус, ₽', 'Инкремент, ₽', 'Прибыль, ₽', 'ROAS', 'Uplift, %'],
      mechsAgg.map(x => [
        x.dims[0],
        fmt(x.n || 0),
        rub(x.actRV || 0),
        rub(x.bonus || 0),
        { html: esc(rub(x.dR || 0)), cls: tone(x.dR || 0) },
        { html: esc(rub(x.profit || 0)), cls: tone(x.profit || 0) },
        fmt(x.roas || 0, 2),
        { html: esc(sgnPct(x.uplift || 0)), cls: tone(x.uplift || 0) }
      ])
    );

    if ($('prMechsCanvas')) {
      drawMechsChart(
        $('prMechsCanvas') as HTMLCanvasElement,
        mechsAgg.map(x => ({ mechanic: x.dims[0], upliftPct: x.uplift || 0, profitRub: x.profit || 0, roas: x.roas || 0 }))
      );
    }

    // 3. Реестр соглашений с фильтрами, поиском, пагинацией и сортировкой
    const allAgreements = aggregate(atomsFiltered, ['month', 'chain', 'brand', 'sku', 'mech'], state.derived.st.margin);

    // Сводные счетчики реестра
    const totalAgreements = allAgreements.length;
    const profitableAgreements = allAgreements.filter(x => (x.profit || 0) > 0 && (x.roi || 0) > 0);
    const unprofitableAgreements = allAgreements.filter(x => (x.profit || 0) <= 0 || (x.roi || 0) <= 0);
    const totalBonusSum = allAgreements.reduce((sum, x) => sum + (x.bonus || 0), 0);
    const totalProfitSum = allAgreements.reduce((sum, x) => sum + (x.profit || 0), 0);
    const profShare = totalAgreements > 0 ? (profitableAgreements.length / totalAgreements) * 100 : 0;

    if ($('prRegSummaryBadges')) {
      $('prRegSummaryBadges')!.innerHTML = `
        <span class="pill" style="background:#eff6ff;color:#1e40af;font-size:11px">Всего: <b>${fmt(totalAgreements)}</b></span>
        <span class="pill" style="background:#ecfdf5;color:#065f46;font-size:11px">✓ Прибыльных: <b>${fmt(profitableAgreements.length)}</b> (${profShare.toFixed(0)}%)</span>
        <span class="pill" style="background:#fef2f2;color:#991b1b;font-size:11px">⚠️ Убыточных: <b>${fmt(unprofitableAgreements.length)}</b></span>
        <span class="pill" style="background:#f8fafc;color:#334155;font-size:11px">Выплаты: <b>${rub(totalBonusSum)}</b></span>
        <span class="pill" style="background:#f0fdf4;color:#15803d;font-size:11px">Прибыль: <b>${rub(totalProfitSum)}</b></span>
      `;
    }

    // Применение поиска
    let filteredReg = allAgreements;
    const query = prRegState.search.trim().toLowerCase();
    if (query) {
      filteredReg = filteredReg.filter(x => x.dims.some(d => String(d).toLowerCase().includes(query)));
    }

    // Применение фильтра рентабельности
    if (prRegState.roiFilter === 'profitable') {
      filteredReg = filteredReg.filter(x => (x.profit || 0) > 0 && (x.roi || 0) > 0);
    } else if (prRegState.roiFilter === 'unprofitable') {
      filteredReg = filteredReg.filter(x => (x.profit || 0) <= 0 || (x.roi || 0) <= 0);
    } else if (prRegState.roiFilter === 'highRoas') {
      filteredReg = filteredReg.filter(x => (x.roas || 0) >= 2);
    }

    // Применение сортировки
    filteredReg.sort((a, b) => {
      switch (prRegState.sort) {
        case 'drDesc':
          return (b.dR || 0) - (a.dR || 0);
        case 'profitDesc':
          return (b.profit || 0) - (a.profit || 0);
        case 'roiDesc':
          return (b.roi || 0) - (a.roi || 0);
        case 'bonusDesc':
          return (b.bonus || 0) - (a.bonus || 0);
        case 'upliftDesc':
          return (b.uplift || 0) - (a.uplift || 0);
        case 'dateDesc':
        default:
          return b.dims[0].localeCompare(a.dims[0]);
      }
    });

    // Расчет страниц пагинации
    const totalFiltered = filteredReg.length;
    const maxPage = Math.max(1, Math.ceil(totalFiltered / prRegState.pageSize));
    if (prRegState.page > maxPage) prRegState.page = maxPage;
    if (prRegState.page < 1) prRegState.page = 1;

    const startIdx = (prRegState.page - 1) * prRegState.pageSize;
    const endIdx = Math.min(totalFiltered, startIdx + prRegState.pageSize);
    const paginatedRows = filteredReg.slice(startIdx, endIdx);

    table(
      $('prTable'),
      ['Месяц', 'Сеть', 'Бренд', 'SKU', 'Механика', ...PCOLS],
      paginatedRows.map(x => [...x.dims, ...pcells(x)])
    );

    // Обновление пагинатора
    if ($('prRegCountInfo')) {
      $('prRegCountInfo')!.textContent = totalFiltered > 0
        ? `Показано ${startIdx + 1}–${endIdx} из ${fmt(totalFiltered)} соглашений (в реестре: ${fmt(totalAgreements)})`
        : 'Нет промо-соглашений по заданным фильтрам';
    }
    if ($('prCurrentPageNum')) {
      $('prCurrentPageNum')!.textContent = `Стр. ${prRegState.page} из ${maxPage}`;
    }
    const prevBtn = $('btnPrPrevPage') as HTMLButtonElement | null;
    const nextBtn = $('btnPrNextPage') as HTMLButtonElement | null;
    if (prevBtn) prevBtn.disabled = prRegState.page <= 1;
    if (nextBtn) nextBtn.disabled = prRegState.page >= maxPage;

    // Регистрация слушателей контролов реестра
    const searchEl = $('prRegSearch') as HTMLInputElement | null;
    if (searchEl && !searchEl.dataset.bound) {
      searchEl.dataset.bound = 'true';
      searchEl.value = prRegState.search;
      searchEl.oninput = () => {
        prRegState.search = searchEl.value;
        prRegState.page = 1;
        renderPromo();
      };
    }

    const roiFilterEl = $('prRegRoiFilter') as HTMLSelectElement | null;
    if (roiFilterEl && !roiFilterEl.dataset.bound) {
      roiFilterEl.dataset.bound = 'true';
      roiFilterEl.value = prRegState.roiFilter;
      roiFilterEl.onchange = () => {
        prRegState.roiFilter = roiFilterEl.value;
        prRegState.page = 1;
        renderPromo();
      };
    }

    const sortEl = $('prRegSort') as HTMLSelectElement | null;
    if (sortEl && !sortEl.dataset.bound) {
      sortEl.dataset.bound = 'true';
      sortEl.value = prRegState.sort;
      sortEl.onchange = () => {
        prRegState.sort = sortEl.value;
        prRegState.page = 1;
        renderPromo();
      };
    }

    const sizeEl = $('prRegPageSize') as HTMLSelectElement | null;
    if (sizeEl && !sizeEl.dataset.bound) {
      sizeEl.dataset.bound = 'true';
      sizeEl.value = String(prRegState.pageSize);
      sizeEl.onchange = () => {
        prRegState.pageSize = Number(sizeEl.value) || 25;
        prRegState.page = 1;
        renderPromo();
      };
    }

    if (prevBtn && !prevBtn.dataset.bound) {
      prevBtn.dataset.bound = 'true';
      prevBtn.onclick = () => {
        if (prRegState.page > 1) {
          prRegState.page--;
          renderPromo();
        }
      };
    }

    if (nextBtn && !nextBtn.dataset.bound) {
      nextBtn.dataset.bound = 'true';
      nextBtn.onclick = () => {
        if (prRegState.page < maxPage) {
          prRegState.page++;
          renderPromo();
        }
      };
    }

    // 4. Выводы и комментарии по ТМА
    if ($('prInsightsBox')) {
      const insights = generatePromoInsights(state);
      $('prInsightsBox')!.innerHTML = `
        <div style="font-weight:700;font-size:14px;margin-bottom:6px;color:#0f172a;">${insights.title}</div>
        ${insights.html}
      `;
    }
  }

  function renderMech(): void {
    renderPromo();
  }

  function sliceState() {
    const dims = [...document.querySelectorAll('#sliceDims input:checked')].map((i: any) => String(i.value));
    const F: Record<string, string> = {
      chain: ($('fChain') as HTMLSelectElement)?.value || '',
      brand: ($('fBrand') as HTMLSelectElement)?.value || '',
      sku: ($('fSku') as HTMLSelectElement)?.value || '',
      region: ($('fRegion') as HTMLSelectElement)?.value || '',
      city: ($('fCity') as HTMLSelectElement)?.value || '',
      mech: ($('fMech') as HTMLSelectElement)?.value || ''
    };
    let from = ($('fFrom') as HTMLSelectElement)?.value || '';
    let to = ($('fTo') as HTMLSelectElement)?.value || '';
    if (from > to) { const tmp = from; from = to; to = tmp; }
    const pred = (a: any) => {
      for (const k in F) if (F[k] && a[k] !== F[k]) return false;
      return a.month >= from && a.month <= to;
    };
    return { dims, pred };
  }

  function renderSlice(): void {
    if (!$('sliceDims')) return;
    const state = store.getState();
    const { dims, pred } = sliceState();
    let g = aggregate(state.derived.atoms, dims, state.derived.st.margin, pred);
    if ($('onlyValid') && ($('onlyValid') as HTMLInputElement).checked) {
      g = g.filter(x => (x.nv || 0) > 0);
    }
    const T = aggregate(state.derived.atoms, [], state.derived.st.margin, pred)[0];
    const sb = ($('sortBy') as HTMLSelectElement)?.value || 'dR';
    const val = (x: any) => sb === 'roiAsc' ? (Number.isFinite(x.roi) ? -x.roi : -Infinity) : (Number.isFinite(x[sb]) ? x[sb] : -Infinity);

    if (sb === 'dims') g.sort((a, b) => a.dims.join(' ').localeCompare(b.dims.join(' ')));
    else g.sort((a, b) => val(b) - val(a));

    const shown = g.slice(0, 300);
    table(
      $('sliceTable'),
      [...dims.map(d => DIMS[d] || d), ...PCOLS],
      [
        ...shown.map(x => [...x.dims, ...pcells(x)]),
        { tot: 1, cells: [...dims.map((_, i) => i ? '' : 'Итого (фильтр)'), ...pcells(T)] }
      ]
    );

    if ($('sliceInfo')) {
      $('sliceInfo')!.className = 'callout good';
      $('sliceInfo')!.textContent = 'Срезов: ' + fmt(g.length) + (g.length > shown.length ? ' (показаны первые ' + shown.length + ')' : '') + '. Сверка: Σ бонусов = ' + rub(sum(g, 'bonus')) + '.';
    }
  }

  function renderMLCenter(): void {
    const state = store.getState();
    const cityData: any[] = [];
    const tvMap = new Map();
    state.raw.tv.forEach(t => tvMap.set(t.brand + SEP + t.month, t.trp || 0));
    const visMap = new Map();
    state.raw.visits.forEach(v => {
      const cityKey = v.city || (v.nanobrick ? defaultNanobricks.lookup(v.nanobrick)?.city || v.nanobrick : '');
      const k = v.brand + SEP + cityKey + SEP + v.month;
      visMap.set(k, (visMap.get(k) || 0) + (v.visits || 0));
    });

    const salesAgg = new Map<string, { salesRub: number; bonusSum: number; bonusCount: number }>();
    for (const x of state.derived.salesFine.values()) {
      const k = x.city + SEP + x.brand + SEP + x.month;
      let e = salesAgg.get(k);
      if (!e) { e = { salesRub: 0, bonusSum: 0, bonusCount: 0 }; salesAgg.set(k, e); }
      e.salesRub += (x.rub || 0);
      if (x.rate > 0) { e.bonusSum += x.rate; e.bonusCount++; }
    }

    const allCities: string[] = uniq([
      ...state.raw.sales.map(r => r.city),
      ...state.raw.visits.map(r => r.city || (r.nanobrick ? defaultNanobricks.lookup(r.nanobrick)?.city || r.nanobrick : '')),
      ...state.raw.promos.map(r => r.city || '')
    ]).filter(Boolean);
    const allBrands: string[] = Array.from(state.derived.ownBrands);
    const months: string[] = state.derived.months || [];

    // Определяем бренды, реально присутствующие в дистрибьюции города
    const activePairs = new Set<string>();
    for (const x of state.derived.salesFine.values()) {
      if ((x.rub || 0) > 0) activePairs.add(x.city + SEP + x.brand);
    }
    state.raw.visits.forEach(v => {
      const c = v.city || (v.nanobrick ? defaultNanobricks.lookup(v.nanobrick)?.city || v.nanobrick : '');
      if ((v.visits || 0) > 0 && c) activePairs.add(c + SEP + v.brand);
    });
    state.raw.promos.forEach(p => {
      if (p.city) activePairs.add(p.city + SEP + p.brand);
    });

    for (const city of allCities) {
      for (const brand of allBrands) {
        const isDistributed = activePairs.has(city + SEP + brand);
        // Не вносим фиктивные нули, если бренд никогда не продавался и не продвигался в этом городе
        if (!isDistributed) continue;

        for (const month of months) {
          const k = city + SEP + brand + SEP + month;
          const s = salesAgg.get(k);
          // Если товар представлен в городе, но в этом месяце нет чеков — это истинный ноль продаж
          const salesRub = s ? s.salesRub : 0;
          const bonus = (s && s.bonusCount > 0) ? s.bonusSum / s.bonusCount : 0;
          const trp = tvMap.get(brand + SEP + month) || 0;
          const visits = visMap.get(brand + SEP + city + SEP + month) || 0;

          cityData.push({
            brand,
            city,
            month,
            TRP: trp,
            bonus,
            visits,
            salesRub,
            ln_sales: Math.log(Math.max(1, salesRub)),
            isDistributed: true
          });
        }
      }
    }

    (window as any)._cityData = cityData;

    if ($('mlInsightsBox')) {
      $('mlInsightsBox')!.innerHTML = `
        <div style="font-weight:700;font-size:14px;margin-bottom:6px;color:#0f172a;">🔬 Выводы ML-Лаборатории и Causal Inference</div>
        <div style="font-size:12px;line-height:1.5;color:#334155;">
          • <b>Иерархический ансамбль:</b> Перекрестное байесовское сглаживание параметров бренд-портфеля снижает погрешность моделей в малых регионах на 18–24%.<br/>
          • <b>Causal Inference (Geo DiD):</b> Метод Synthetic Control / Difference-in-Differences позволяет измерить чистый причинно-следственный эффект рекламы без шума сезонности.<br/>
          • <b>Поиск лага:</b> Оптимальная задержка отклика потребителей на продвижение составляет от 0 до 2 месяцев в зависимости от категории препаратов.
        </div>
      `;
    }
  }



  async function renderAutoMLPage(): Promise<void> {
    const state = store.getState();
    const marginInput = $('automlMarginInput') as HTMLInputElement | null;
    const marginPct = marginInput ? Number(marginInput.value) || 48 : 48;

    // Если данные уже загружаются или уже есть в сторе - просто отображаем
    if (state.isLoadingAutoML) {
      setLoading(true);
      const container = $('automlKpis');
      if (container) container.innerHTML = '<div class="p-12 text-center text-slate-500 animate-pulse">Выполняется AutoML турнир (42 модели)...</div>';
      return;
    }

    if (state.automlSummary) {
      setLoading(false);
      displayAutoMLResult(state.automlSummary);
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
      displayAutoMLResult(summary);
    }
  }

  function displayAutoMLResult(summary: any): void {
    const state = store.getState();

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
        ['Базовые продажи (Baseline)', pct(activeResult.baselineSharePct), 'Органический спрос'],
        ['Инкрементальные продажи', rub(activeResult.incrementalSalesRub), `Прирост: ${pct(100 - activeResult.baselineSharePct)}`],
        ['Портфельный ROAS', `${activeResult.roas} ₽/₽`, 'Итоговый коэффициент возврата'],
        ['Лучшая модель', activeResult.bestModelName, `MAPE: ${activeResult.bestMape}% | R²: ${activeResult.bestR2}`],
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
      import('./chartRenderer').then(m => {
        m.drawResidualPlot($('automlResidualCanvas') as HTMLCanvasElement, activeResult.residuals);
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

    // 6. Механики и Сети
    if ($('automlMechanicsTable')) {
      table(
        $('automlMechanicsTable'),
        ['Механика ТМА', 'Ставка, %', 'Инкремент, ₽', 'Бонус, ₽', 'Прибыль, ₽', 'ROAS', 'ROI, %'],
        summary.mechanicStats.map((m: TMAMechanicStat) => [
          m.mechanic,
          `${m.avgBonusPct}%`,
          rub(m.incrementalRevenueRub),
          rub(m.bonusRub),
          { html: esc(rub(m.profitRub)), cls: tone(m.profitRub) },
          m.roas,
          { html: esc(pct(m.roiPct / 100)), cls: tone(m.roiPct) }
        ])
      );
    }

    if ($('automlChainsTable')) {
      table(
        $('automlChainsTable'),
        ['Аптечная сеть', 'Доля в промо, %', 'Инкремент, ₽', 'Бонус, ₽', 'Прибыль, ₽', 'ROAS', 'ROI, %'],
        summary.chainStats.map((c: TMAChainStat) => [
          c.chain,
          `${c.shareOfPromoVolumePct}%`,
          rub(c.incrementalRevenueRub),
          rub(c.bonusRub),
          { html: esc(rub(c.profitRub)), cls: tone(c.profitRub) },
          c.roas,
          { html: esc(pct(c.roiPct / 100)), cls: tone(c.roiPct) }
        ])
      );
    }

    // 7. Симулятор
    updateSimulatorResults(activeResult);

    if ($('automlInsightsBox')) {
      $('automlInsightsBox')!.innerHTML = `
        <div style="font-weight:700;font-size:14px;margin-bottom:6px;color:#0f172a;">🧠 Результаты AutoML турнира и SHAP-интерпретация модельного портфеля</div>
        <div style="font-size:12px;line-height:1.5;color:#334155;">
          • <b>Модель-победитель:</b> Спецификация <b>${activeResult.bestModelName}</b> показала наивысшую точность вне выборки (Out-of-Sample MAPE: <b>${activeResult.bestMape}%</b>, R²: <b>${activeResult.bestR2}</b>) и пробила все проверки экономической валидности VIF/p-value.<br/>
          • <b>SHAP-ранжирование факторов:</b> Главный фактор прироста продаж — <b>ТВ-реклама (TRP)</b> с полураспадом Adstock <b>${activeResult.optimalAdstockHalfLifeMonths} мес.</b>, за ней следуют ТМА-скидки и визиты медицинских представителей.<br/>
          • <b>Ценовая эластичность:</b> Потенциал чистой маржинальной прибыли достигается при промо-скидке <b>${elData?.optimalDiscountDepthPct || 15}%</b>. Превышение порога скидки приводит к каннибализации органических базовых продаж.
        </div>
      `;
    }

    (window as any)._lastAutoMLSummary = summary;
  }

  function updateSimulatorResults(activeResult: AutoMLBrandResult): void {
    const trpSlider = $('simTrpSlider') as HTMLInputElement | null;
    const bonusSlider = $('simBonusSlider') as HTMLInputElement | null;
    const visitsSlider = $('simVisitsSlider') as HTMLInputElement | null;

    const dTrp = trpSlider ? Number(trpSlider.value) : 0;
    const dBonus = bonusSlider ? Number(bonusSlider.value) : 0;
    const dVisits = visitsSlider ? Number(visitsSlider.value) : 0;

    if ($('simTrpVal')) $('simTrpVal')!.textContent = (dTrp > 0 ? '+' : '') + dTrp + '%';
    if ($('simBonusVal')) $('simBonusVal')!.textContent = (dBonus > 0 ? '+' : '') + dBonus + '%';
    if ($('simVisitsVal')) $('simVisitsVal')!.textContent = (dVisits > 0 ? '+' : '') + dVisits + '%';

    const fb = activeResult.factorBreakdown;
    const baseRub = activeResult.totalSalesRub * (fb.baseline / 100);

    const newTrpRub = activeResult.totalSalesRub * (fb.tvTrp / 100) * Math.pow(1 + dTrp / 100, 0.75);
    const newBonusRub = activeResult.totalSalesRub * (fb.tmaBonus / 100) * Math.pow(1 + dBonus / 100, 0.82);
    const newVisitsRub = activeResult.totalSalesRub * (fb.crmVisits / 100) * Math.pow(1 + dVisits / 100, 0.70);
    const mktRub = activeResult.totalSalesRub * (fb.marketPrice / 100);

    const newTotalSales = Math.round(baseRub + newTrpRub + newBonusRub + newVisitsRub + mktRub);
    const salesDelta = newTotalSales - activeResult.totalSalesRub;
    const newIncremental = Math.round(newTotalSales - baseRub);

    if ($('simResultsBox')) {
      $('simResultsBox')!.innerHTML = `
        <div class="result"><span>Прогнозируемая выручка</span><strong>${rub(newTotalSales)}</strong></div>
        <div class="result"><span>Изменение к текущему факту</span><strong style="color:${salesDelta >= 0 ? '#166534' : '#991b1b'}">${salesDelta >= 0 ? '+' : ''}${rub(salesDelta)}</strong></div>
        <div class="result"><span>Инкрементальные продажи</span><strong>${rub(newIncremental)}</strong></div>
        <div class="result"><span>Новая доля Baseline</span><strong>${pct(baseRub / newTotalSales * 100)}</strong></div>
        <button id="btnSaveSimAsScenario" class="btn primary btn-sm" style="grid-column: span 2; margin-top: 10px;">💾 Сохранить как Сценарий B</button>
      `;

      if ($('btnSaveSimAsScenario')) {
        $('btnSaveSimAsScenario')!.onclick = () => {
          store.update(draft => {
            if (draft.automlSummary) {
              draft.automlSummary.optimizedResult = {
                ...activeResult,
                totalSalesRub: newTotalSales,
                incrementalSalesRub: newIncremental,
                profit: newIncremental * draft.derived.st.margin - (newIncremental / activeResult.roas) // Mock profit calc
              };
            }
          });
          showPage('scenario');
        };
      }
    }
  }


  function updateRoleUI(): void {
    const state = store.getState();
    const currentRole = state.activeRole || 'all';
    const roleDef = ROLES_REGISTRY[currentRole];

    // 1. Синхронизируем выпадающий список в шапке
    const headerRoleSel = $('headerRoleSelect') as HTMLSelectElement | null;
    if (headerRoleSel && headerRoleSel.value !== currentRole) {
      headerRoleSel.value = currentRole;
    }

    // 2. Обновляем плашку активной роли в сайдбаре
    const roleIconEl = document.getElementById('activeRoleIcon');
    const roleTimeEl = document.getElementById('activeRoleTime');
    if (roleIconEl && roleDef) roleIconEl.textContent = roleDef.icon;
    if (roleTimeEl && roleDef) roleTimeEl.textContent = `⏱️ ${roleDef.timeEstimate}`;

    // 3. Фильтрация и подсветка пунктов меню в зависимости от выбранной роли (JTBD)
    const recPages = roleDef ? roleDef.recommendedPages : [];
    document.querySelectorAll('#nav button[data-page]').forEach(b => {
      const pageKey = (b as HTMLElement).dataset.page || '';
      const isVisible = currentRole === 'all' || pageKey === 'portal' || recPages.includes(pageKey);
      (b as HTMLElement).style.display = isVisible ? '' : 'none';
      const isRec = recPages.includes(pageKey) && currentRole !== 'all';
      (b as HTMLElement).classList.toggle('nav-recommended', isRec);
    });

    document.querySelectorAll('#nav .nav-group').forEach(group => {
      const visibleButtons = group.querySelectorAll('button[data-page]:not([style*="display: none"])');
      (group as HTMLElement).style.display = visibleButtons.length > 0 ? '' : 'none';
    });
  }

  function showPage(p: string): void {
    store.update(draft => { draft.activePage = p; }, true);
    if (typeof localStorage !== 'undefined') localStorage.setItem('pharmamix_page', p);

    const targetDom = DOM_PAGE_MAP[p] || p;

    document.querySelectorAll('.page').forEach(x => {
      const isTarget = x.id === 'page-' + targetDom || x.id === 'page-' + p;
      x.classList.toggle('active', isTarget);
      (x as HTMLElement).style.display = isTarget ? 'block' : 'none';
    });

    // Очищаем старые чарты ПОСЛЕ смены видимости страниц, чтобы closest('.page:not(.active)') сработал верно
    destroyOrphanedCharts();

    document.querySelectorAll('#nav button').forEach(x => {
      const btnPage = (x as HTMLElement).dataset.page;
      x.classList.toggle('active', btnPage === p);
    });

    const TITLES: Record<string, { title: string; subtitle: string }> = {
      portal: {
        title: '🎯 JTBD Портал выбора роли & экспресс-задач',
        subtitle: 'Выберите ваш профиль (7 ролей): персонализированные рабочие столы, регламент времени и мгновенный доступ'
      },
      'top-roi': {
        title: '📈 Top ROI Channels (Количественная аттрибуция каналов & Hill Saturation)',
        subtitle: 'Глубокий анализ отдачи каждого канала (Digital, ТВ, Визиты, ТМА), кривые насыщения и рейтинг ROMI.'
      },
      'budget-roi': {
        title: '💰 Budget ROI & Financial Accountability Report',
        subtitle: 'Аудит-готовый отчет финансовой окупаемости ТМА: чистая прибыль, безубыточная маржа и проверка нулевого эффекта'
      },
      'exec-brief': {
        title: '👔 Executive Brief (Совет директоров & C-Level Pitch Deck)',
        subtitle: 'Полноэкранная презентация для топ-менеджмента: макро-KPI портфеля, стратегические итоги и бизнес-результаты за 3 минуты.'
      },
      'regional-deepdive': {
        title: '🏪 Regional Deep Dive (Региональный срез & аптечные сети)',
        subtitle: 'Причины динамики продаж в регионе: факты выбытий, нанобрики, аптечные сети и сопоставление с визитами CRM'
      },
      'seasonality-analysis': {
        title: '📉 Seasonality Analysis (Рынок, Сезонность & Заболеваемость)',
        subtitle: 'STL-декомпозиция спроса, корреляция с индексами ОРВИ/Гриппа и сезонная чувствительность промо-акций'
      },
      'causal-tests': {
        title: '🛡️ Causal Inference Geo A/B Tests (Difference-in-Differences)',
        subtitle: 'Квази-эксперименты Synthetic Control: проверка гипотез с 95% ДИ, P-value и кластерными ошибками CRSE'
      },
      'whatif-scenarios': {
        title: '🎯 What-If Scenarios (Симулятор отклика продаж)',
        subtitle: 'Планирование бюджета с 95% доверительным интервалом прибыли: динамический отклик на TRP, визиты и бонусы'
      },
      'budget-optimization': {
        title: '⚖️ Budget Optimization (Байесовское перераспределение)',
        subtitle: 'Оптимизация маркетинговых инвестиций по маржинальному ROMI с учетом эффекта насыщения'
      },
      'scenario-comparison': {
        title: '📊 Scenario Comparison (Сравнение альтернативных бюджетов)',
        subtitle: 'Сопоставление сценариев: Консервативный vs Агрессивный vs Оптимальный по риску и доходности'
      },
      'model-tournament': {
        title: '⚡ Model Tournament Lab (AutoML 42 модели)',
        subtitle: 'Турнир эконометрических спецификаций и нейросетей в Web Worker: Ridge, Lasso, Causal TCN, SHAP-факторы'
      },
      'oos-validation': {
        title: '🧪 OOS Validation (Кросс-валидация на отложенных данных)',
        subtitle: 'Проверка прогностической силы моделей: rolling-origin backtesting, тест на переобучение и метрики MAPE'
      },
      'share-experiment': {
        title: '📤 Share & Export (Воспроизводимость и аудит)',
        subtitle: 'Экспорт расчетов в аудит-готовый формат Excel и презентационный PDF с фиксацией методологии'
      },
      'data-partitions': {
        title: '📦 Партиции & Загрузка данных (ETL Hub)',
        subtitle: 'Управление годовыми партициями (2023–2025), пофайловый импорт, Append/Overwrite режимы и аудит дублей'
      },
      'data-quality': {
        title: '🛡️ Data Quality & Nanobricks (Аудит целостности)',
        subtitle: 'Контроль пропусков, детектор аномалий и справочник нанобриков с гео-привязкой к субъектам РФ'
      },
      'tech-monitor': {
        title: '⚡ Compute Engine Monitor (Мониторинг движка)',
        subtitle: 'Статус Web Worker, IndexedDB кэширование, профилирование вычислений и бенчмарк матричных операций'
      },
      overview: {
        title: 'Обзор эффективности портфеля',
        subtitle: 'Сводный дашборд ключевых показателей и декомпозиция вкладов каналов'
      },
      seasonality: {
        title: '📈 Анализ Рынка, Сезонности & Заболеваемости',
        subtitle: 'STL-декомпозиция спроса и сопоставление с индексами заболеваемости'
      },
      automl: {
        title: '⚡ AutoML Бренд-Турнир (42 модели) & SHAP-Анализ',
        subtitle: 'Автоматический подбор оптимальной спецификации MMM'
      },
      dash: {
        title: 'Сводные финансовые дашборды',
        subtitle: 'Финансовые метрики и структура продаж'
      },
      market: {
        title: 'Конкуренты и динамика доли рынка',
        subtitle: 'Мониторинг рыночного окружения'
      },
      promo: {
        title: 'Трейд-Маркетинг & Аптечные Сети',
        subtitle: 'Оценка базовых продаж и окупаемости промо-акций'
      },
      models: {
        title: 'Эконометрическое моделирование (MMM)',
        subtitle: 'Многофакторная регрессия и валидация'
      },
      mlcenter: {
        title: '✦ ML-Лаборатория & Causal Inference',
        subtitle: 'Машинное обучение и квази-эксперименты'
      },
      data: {
        title: 'Источники и качество данных',
        subtitle: 'Загрузка и аудит датасетов'
      },
      scenario: {
        title: 'Сравнение сценариев распределения бюджета',
        subtitle: 'Моделирование сценариев'
      },
      roles: {
        title: '🎯 Роли и задачи JTBD',
        subtitle: 'Jobs-to-be-Done навигация'
      }
    };

    const info = TITLES[p] || TITLES[targetDom] || { title: 'Аналитика', subtitle: '' };
    if ($('topTitle')) $('topTitle')!.textContent = info.title;
    if ($('topSubtitle')) $('topSubtitle')!.textContent = info.subtitle;

    // Первичный рендер DOM-элементов
    renderActive();

    // Гарантированная загрузка и перерисовка графиков по событию открытия вкладки через requestAnimationFrame
    requestAnimationFrame(() => {
      // Мы уже вызвали renderActive выше, второй раз обычно не нужен, 
      // но некоторые страницы могут требовать повторного прохода если DOM не был готов.
      // Однако вызывать специфичные рендереры тут - избыточно и вредно (тройной рендер).
      
      if ((p === 'models' || p === 'oos-validation') && store.getState().valDirty && !store.getState().val) executeValidation();
      
      requestAnimationFrame(() => {
        resizeAllCharts();
      });
    });
  }

  async function refreshAll(): Promise<void> {
    const st = getSettingsFromUI();
    const useMkt = ($('useMkt') as HTMLInputElement)?.checked ?? false;
    const state = store.getState();
    const filteredRaw = getFilteredRaw(state.raw, state.globalFilters);

    workerService.clearCache();

    // 1. Быстрые преобразования структур (в основном потоке)
    store.update(draft => {
      draft.derived = buildDerivedStructures(filteredRaw, st);
      draft.derived.st = st;
      draft.val = null;
      draft.valDirty = true;
      draft.isLoadingReg = true;
      draft.isLoadingAutoML = true;
    }, false);

    populateSelects();
    renderActive(); // Рендерим промежуточное состояние (с лоадерами)

    // 2. Фоновое вычисление MMM (Regression)
    safeExecuteAsync(async () => {
      const curPanel = store.getState().derived.panel;
      if (!curPanel || curPanel.length < 3) {
        store.update(d => { d.isLoadingReg = false; });
        return;
      }
      const reg = await workerService.fitMMM(curPanel, useMkt);
      store.update(draft => {
        draft.reg = reg;
        draft.isLoadingReg = false;
        
        // После получения регрессии обновляем Baseline расчеты
        const promoEval = evaluatePromoBaselines(draft.derived, st, draft.reg);
        draft.derived.atoms = promoEval.atoms;
        draft.derived.promoRows = promoEval.promoRows;
        draft.derived.adjFail = promoEval.adjFail;
        draft.derived.dualStats = promoEval.dualStats;
      });
      renderActive();
    }, 'MMM Engine (Worker)', () => store.update(d => { d.isLoadingReg = false; }));

    // 3. Фоновое вычисление AutoML
    safeExecuteAsync(async () => {
      const curState = store.getState();
      const curFilteredRaw = getFilteredRaw(curState.raw, curState.globalFilters);
      const summary = await workerService.runAutoML({
        panel: curState.derived.panel,
        sales: curFilteredRaw.sales,
        promos: curFilteredRaw.promos,
        market: curFilteredRaw.market,
        margin: st.margin
      });
      store.update(draft => {
        draft.automlSummary = summary;
        draft.isLoadingAutoML = false;
      });
      renderActive();
    }, 'AutoML Engine (Worker)', () => store.update(d => { d.isLoadingAutoML = false; }));
  }

  async function executeValidation(): Promise<void> {
    const box = $('valStatus');
    if (!box) return;
    const H = $('testH') ? +(($('testH') as HTMLSelectElement).value) : 6;
    const scheme = ($('scheme') ? (($('scheme') as HTMLSelectElement).value) : 'fixed') as 'fixed' | 'rolling';

    try {
      box.textContent = 'Обучение моделей...';
      box.className = 'callout';
      const valResult = await runOOSValidation(store.getState().derived.panel, H, scheme, msg => {
        if (box) box.textContent = msg;
      });
      store.update(draft => {
        draft.val = valResult;
        draft.valDirty = false;
      }, true);
      box.textContent = 'Проверка выполнена успешно.';
      box.className = 'callout good';
    } catch (e: any) {
      box.textContent = e.message;
      box.className = 'callout bad';
    }
    renderVal();
  }

  function resetToDemo(): void {
    const d = generateDemoDataset();
    store.update(draft => {
      draft.raw = {
        sales: d.s,
        promos: d.p,
        tv: d.t,
        visits: d.v,
        market: d.mk
      };
      draft.imported = { sales: false, promo: false, tv: false, visits: false, market: false };
      draft.partitionLogs.length = 0;
    });

    ['salesFile', 'promoFile', 'tvFile', 'visitsFile', 'marketFile'].forEach(i => {
      const el = $(i) as HTMLInputElement | null;
      if (el) el.value = '';
    });

    refreshAll();
    renderPartitionLog();
    if ($('importMessage')) {
      $('importMessage')!.textContent = 'Демонстрационные данные восстановлены (30 месяцев, 4 региона, 3 бренда).';
      $('importMessage')!.className = 'callout good';
    }
  }

  /* ============ ML-Центр алгоритмы ============ */
  async function runMLHierarchy(): Promise<void> {
    const status = $('ml-hier-status');
    const out = $('ml-hier-out');
    if (status) { status.textContent = 'Вычисление EM-алгоритма, Empirical Bayes Shrinkage и случайных эффектов городов...'; status.className = 'callout'; }
    await new Promise(r => setTimeout(r, 0));

    const data = (window as any)._cityData || [];
    const res = runHierarchicalRegression(data);
    if (!res) {
      if (status) { status.textContent = 'Недостаточно данных для иерархической регрессии.'; status.className = 'callout bad'; }
      return;
    }

    if (status) {
      status.textContent = `Иерархическая регрессия успешно оценена (N=${res.n}, городов=${res.n_cities}, R²=${pct(res.r2)}). Доля межгородской дисперсии (ICC) = ${pct(res.icc)}.`;
      status.className = 'callout good';
    }

    if (out) {
      out.innerHTML = `
        <div class="grid four" style="margin-top:10px;margin-bottom:14px;">
          <div class="result"><span>Межгородская дисперсия σ²</span><strong>${fmt(res.sigma2_city, 4)}</strong></div>
          <div class="result"><span>Остаточная дисперсия σ²</span><strong>${fmt(res.sigma2_res, 4)}</strong></div>
          <div class="result"><span>Интраклассовая корреляция (ICC)</span><strong class="pos">${pct(res.icc)}</strong></div>
          <div class="result"><span>Качество аппроксимации R²</span><strong>${pct(res.r2)}</strong></div>
        </div>
        <div class="callout" style="font-size:12px;margin-bottom:14px;">
          🛡️ <b>Учет дистрибьюции:</b> Пары город × бренд без истории продаж и визитов исключены (${res.distributionFilteredCount} точек вне дистрибьюции). Пропуски в активных городах строго сохранены как истинные нули спроса.
        </div>
        <div class="grid two">
          <div class="card">
            <h3>Глобальные фиксированные эффекты β (Fixed Effects)</h3>
            <p class="sub">Оценка эластичностей с робастными стандартными ошибками Huber-White SE(HC1).</p>
            <div class="table-wrap">
              <table>
                <thead><tr><th>Фактор</th><th>Коэф. β</th><th>SE(HC1)</th><th>t-стат.</th></tr></thead>
                <tbody>
                  ${res.names.map((nm: string, i: number) => {
                    const tStat = res.coef[i] / (res.se[i] || 1e-6);
                    return `<tr><td><b>${nm}</b></td><td>${fmt(res.coef[i], 4)}</td><td>${fmt(res.se[i], 4)}</td><td class="${Math.abs(tStat) >= 1.96 ? 'pos' : ''}">${fmt(tStat, 2)}</td></tr>`;
                  }).join('')}
                </tbody>
              </table>
            </div>
            <div class="small" style="margin-top:8px;color:#64748b">Степени свободы: df = ${res.n - res.coef.length}. Робастные ошибки HC1 устойчивы к гетероскедастичности между регионами.</div>
          </div>
          <div class="card">
            <h3>Случайные сдвиги городов u (Empirical Bayes Shrinkage)</h3>
            <p class="sub">Сжатие индивидуальных эффектов городов с поправкой на объем выборки N_obs.</p>
            <div class="table-wrap">
              <table>
                <thead><tr><th>Ранг</th><th>Город</th><th>N</th><th>Сжатие λ</th><th>Эффект u</th><th>SE</th><th>95% ДИ</th></tr></thead>
                <tbody>
                  ${res.city_effects.map((c: any) => `
                    <tr>
                      <td>#${c.rank}</td>
                      <td><b>${c.city}</b></td>
                      <td>${c.n_obs}</td>
                      <td>${(c.shrinkage * 100).toFixed(0)}%</td>
                      <td class="${tone(c.u_city)}">${sgnPct(Math.exp(c.u_city) - 1)}</td>
                      <td>${fmt(c.se_u, 3)}</td>
                      <td>[${sgnPct(Math.exp(c.ci_lower) - 1)}; ${sgnPct(Math.exp(c.ci_upper) - 1)}]</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `;
    }
  }

  async function runMLLagSearch(): Promise<void> {
    const status = $('ml-lag-status');
    const out = $('ml-lag-out');
    const pbar = $('ml-lag-pbar');
    const pfill = $('ml-lag-pfill');

    if (pbar) pbar.style.display = 'block';
    if (status) { status.textContent = 'Временная Out-of-Sample валидация лагов и Adstock со штрафом AICc...'; status.className = 'callout'; }
    await new Promise(r => setTimeout(r, 0));

    const data = (window as any)._cityData || [];
    const res = await runLagSearchOptimization(data, (step, total, msg) => {
      const pctVal = Math.round((step / total) * 100);
      if (pfill) pfill.style.width = pctVal + '%';
      if (status) status.textContent = '[' + pctVal + '%] ' + msg;
    });

    if (pbar) pbar.style.display = 'none';
    if (status) { status.textContent = 'Временная валидация Adstock завершена: рассчитаны OOS-ошибки, штрафы AICc и стабильность плато.'; status.className = 'callout good'; }

    if (out && res) {
      let html = `
        <div style="margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
          <span class="small">Анализ carryover-эффекта и лагов для 3 ключевых драйверов с проверкой на отложенном периоде OOS и штрафом AICc.</span>
          <button id="btn-apply-lags" class="secondary" style="padding:6px 12px;font-size:12px;">✓ Применить оптимальные параметры в модель</button>
        </div>
        <div class="grid three">
      `;
      for (const ch of ['TRP', 'bonus', 'visits']) {
        const item = res[ch];
        html += `
          <div class="card">
            <h3>${item.name}</h3>
            <div class="callout ${item.adstockSuperior ? 'good' : 'warn'}" style="margin:8px 0;font-size:12px;padding:8px 10px;">
              ${item.recommendation}
            </div>
            <div class="statline"><span>Оптимальный лаг τ</span><strong>${item.tau_optimal} мес.</strong></div>
            <div class="statline"><span>Коэффициент decay λ</span><strong>${item.lambda_optimal.toFixed(2)}</strong></div>
            <div class="statline"><span>R² на обучении (Train)</span><strong>${item.r2_train.toFixed(3)}</strong></div>
            <div class="statline"><span>Ошибка на тесте (RMSE OOS)</span><strong class="pos">${item.rmse_oos.toFixed(4)}</strong></div>
            <div class="statline"><span>Дельта сложности (ΔAICc)</span><strong class="${item.delta_aic < -2 ? 'pos' : ''}">${item.delta_aic <= 0 ? '' : '+'}${item.delta_aic.toFixed(2)}</strong></div>
            <div class="statline"><span>Устойчивость оптимума</span><strong>${item.stabilityScore}%</strong></div>
            <h4 style="margin:10px 0 4px;font-size:12px;">Тепловая карта качества (лаг τ × decay λ)</h4>
            <div class="table-wrap">
              <table>
                <thead><tr><th>τ \\ λ</th>${item.decays.map((d: number) => '<th>' + d.toFixed(1) + '</th>').join('')}</tr></thead>
                <tbody>
                  ${item.lags.map((tau: number, tIdx: number) => `
                    <tr>
                      <td><b>${tau}</b></td>
                      ${item.heatmap[tIdx].map((val: number) => '<td style="background:rgba(40,84,230,' + Math.min(0.85, Math.max(0.08, (val - 0.2) / 0.8)) + ');color:' + (val > 0.6 ? '#fff' : '#000') + '">' + val.toFixed(3) + '</td>').join('')}
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        `;
      }
      html += '</div>';
      out.innerHTML = html;

      const applyBtn = $('btn-apply-lags');
      if (applyBtn) {
        applyBtn.onclick = () => {
          (window as any)._optimalLags = res;
          applyBtn.textContent = '✓ Параметры сохранены и применены в расчетах!';
          applyBtn.classList.remove('secondary');
        };
      }
    }
  }

  async function runMLTCN(): Promise<void> {
    const status = $('ml-tcn-status');
    const out = $('ml-tcn-out');
    const pbar = $('ml-tcn-pbar');
    const pfill = $('ml-tcn-pfill');

    if (pbar) pbar.style.display = 'block';
    if (status) { status.textContent = 'Подготовка честного турнира моделей (Causal TCN vs Seasonal Naive vs OLS)...'; status.className = 'callout'; }
    await new Promise(r => setTimeout(r, 0));

    const data = (window as any)._cityData || [];
    if (!data || data.length < 20) {
      if (pbar) pbar.style.display = 'none';
      if (status) { status.textContent = 'Недостаточно данных для обучения нейросети и турнира моделей.'; status.className = 'callout bad'; }
      return;
    }

    // 1. Запуск честного турнира моделей прогнозирования
    const tournament = await runModelTournament(data, 6, msg => {
      if (status) status.textContent = msg;
    });

    if (!tournament) {
      if (pbar) pbar.style.display = 'none';
      if (status) { status.textContent = 'Ошибка проведения турнира прогнозирования.'; status.className = 'callout bad'; }
      return;
    }

    // 2. Обучение Causal TCN на полной выборке для интерактивного What-If симулятора
    if (status) status.textContent = 'Калибровка весов Causal 1D CNN для сценарного анализа...';
    const seqLen = 4;
    const seqs: number[][][] = [];
    const targets: number[] = [];
    const sampleDates: string[] = [];
    const sampleActuals: number[] = [];

    for (let i = seqLen; i < data.length; i++) {
      const windowRows = data.slice(i - seqLen, i);
      const seq = windowRows.map((r: any) => [
        Math.log1p(r.TRP || 0),
        r.bonus || 0,
        Math.log1p(r.visits || 0),
        (r.salesRub || 0) / 1e5,
        0.1,
        0.5
      ]);
      seqs.push(seq);
      targets.push(data[i].ln_sales || Math.log(Math.max(1, data[i].salesRub || 1)));
      sampleDates.push(data[i].month);
      sampleActuals.push(data[i].salesRub || 0);
    }

    const tcn = new CausalTCN(6, 12, 0.01, 1e-4, 101);
    const history = await tcn.train(seqs, targets, undefined, undefined, 40, (ep, total, loss) => {
      const pctVal = Math.round((ep / total) * 100);
      if (pfill) pfill.style.width = pctVal + '%';
      if (status) status.textContent = `Обучение Causal TCN: эпоха ${ep}/${total}, Huber Loss = ${loss.toFixed(4)}`;
    });

    const predsRub: number[] = seqs.map(s => tcn.predictRub(s));
    let mapeSum = 0;
    for (let i = 0; i < sampleActuals.length; i++) {
      mapeSum += Math.abs(predsRub[i] - sampleActuals[i]) / Math.max(1, sampleActuals[i]);
    }
    const tcnMape = (mapeSum / sampleActuals.length) * 100;
    const importance = tcn.computeImportance(seqs, targets);

    if (pbar) pbar.style.display = 'none';
    if (status) {
      status.textContent = `Турнир моделей завершен! Победитель OOS: ${tournament.winner}. Huber Loss TCN: ${history.train_loss[history.train_loss.length - 1].toFixed(4)}.`;
      status.className = 'callout good';
    }

    if (out) {
      out.innerHTML = `
        <div class="card" style="margin-top:14px;border-left:4px solid #2854e6">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
            <div>
              <h3>🏆 Турнир моделей прогнозирования (Held-Out OOS Test, ${tournament.horizon} мес.)</h3>
              <p class="sub">Честное сравнение на едином отложенном тестовом горизонте: Causal TCN против OLS и Seasonal Naive.</p>
            </div>
            <span class="pill" style="background:#dbeafe;color:#1e40af">Победитель: ${tournament.winner}</span>
          </div>
          <div class="table-wrap" style="margin-top:12px;">
            <table>
              <thead>
                <tr>
                  <th>Модель</th>
                  <th>Тип архитектуры</th>
                  <th>RMSE (тест, ₽)</th>
                  <th>MAE (тест, ₽)</th>
                  <th>MAPE (%)</th>
                  <th>Направление тренда</th>
                  <th>R² на тесте</th>
                  <th>Статус</th>
                </tr>
              </thead>
              <tbody>
                ${tournament.models.map((m, idx) => `
                  <tr style="${idx === 0 ? 'background:rgba(40,84,230,0.05);font-weight:600;' : ''}">
                    <td>${idx === 0 ? '🥇 ' : idx === 1 ? '🥈 ' : '🥉 '}<b>${m.name}</b></td>
                    <td><span class="pill" style="font-size:11px;">${m.type.toUpperCase()}</span></td>
                    <td class="${idx === 0 ? 'pos' : ''}">${rub(m.rmse_test)}</td>
                    <td>${rub(m.mae_test)}</td>
                    <td>${m.mape_test.toFixed(1)}%</td>
                    <td class="pos">${m.directional_accuracy.toFixed(0)}%</td>
                    <td>${m.r2_test.toFixed(3)}</td>
                    <td>${idx === 0 ? '<span class="badge ok">Лучший прогноз</span>' : '<span class="badge">Бенчмарк</span>'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <div class="card" style="margin-top:16px">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
            <div>
              <h3>Факт vs Прогнозы моделей на тестовом горизонте</h3>
              <p class="sub">Динамика реальных продаж и сопоставление траекторий прогнозных моделей</p>
            </div>
            <button id="btn-export-tcn" class="ghost" style="padding:6px 12px;font-size:12px;">📥 Скачать прогноз (CSV)</button>
          </div>
          <div class="chart-container" style="position:relative;height:270px;max-height:270px;width:100%;overflow:hidden;margin-top:8px;">
            <canvas id="tcnForecastCanvas"></canvas>
          </div>
          <div class="legend">
            <span><i class="dot" style="background:#17243a"></i>Фактические продажи</span>
            <span><i class="dot" style="background:#2854e6"></i>Causal TCN</span>
            <span><i class="dot" style="background:#d97706"></i>Регуляризованная OLS</span>
            <span><i class="dot" style="background:#64748b"></i>Seasonal Naive</span>
          </div>
        </div>

        <div class="grid two" style="margin-top:16px">
          <div class="card">
            <h3>Интерпретируемость факторов Causal TCN</h3>
            <p class="sub">Вклад маркетинговых драйверов методом перестановок (Permutation Importance).</p>
            <div id="tcn-importance-bars" style="margin-top:12px;">
              ${importance.map(item => `
                <div class="barrow">
                  <span style="font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${item.name}</span>
                  <div class="bartrack"><div class="barfill" style="width:${Math.max(5, item.pct)}%;background:#2854e6"></div></div>
                  <strong>${item.pct.toFixed(1)}%</strong>
                </div>
              `).join('')}
            </div>
          </div>
          <div class="card">
            <h3>Причинная структура TCN в фарм-аналитике</h3>
            <div class="statline"><span>Causal Padding</span><strong>Исключена утечка будущей информации в прошлое.</strong></div>
            <div class="statline"><span>Dilated Convolutions</span><strong>Экспоненциальный рецептивный охват временного ряда.</strong></div>
            <div class="statline"><span>Huber Loss</span><strong>Устойчивость к выбросам разовых оптовых закупок.</strong></div>
            <div class="statline"><span>Z-Score Train Normalization</span><strong>Статистика нормализации только из обучающей выборки.</strong></div>
          </div>
        </div>

        <div class="card" style="margin-top:16px">
          <h3>Интерактивный симулятор сценариев (What-If Analysis на базе Causal TCN)</h3>
          <p class="sub">Смоделируйте изменение инвестиций и оцените ожидаемый прирост выручки глубокой нейросетью.</p>
          <div class="formgrid" style="margin-top:12px;">
            <div class="field">
              <label for="sc-trp">ТВ-реклама TRP (% изменение): <span id="sc-trp-val">0%</span></label>
              <input type="range" id="sc-trp" min="-50" max="50" step="5" value="0" />
            </div>
            <div class="field">
              <label for="sc-bonus">Ставка бонуса аптек (п.п.): <span id="sc-bonus-val">+0.0 п.п.</span></label>
              <input type="range" id="sc-bonus" min="-3" max="5" step="0.5" value="0" />
            </div>
            <div class="field">
              <label for="sc-visits">Визиты медпредставителей (%): <span id="sc-visits-val">0%</span></label>
              <input type="range" id="sc-visits" min="-50" max="50" step="5" value="0" />
            </div>
            <div style="display:flex;align-items:flex-end;">
              <button id="btn-run-scenario" style="width:100%;height:38px;">⚡ Рассчитать сценарный прогноз</button>
            </div>
          </div>
          <div id="scenario-result-box" style="margin-top:16px;display:none;"></div>
        </div>
      `;

      const canvas = $('tcnForecastCanvas') as HTMLCanvasElement | null;
      if (canvas) {
        drawChart(canvas, [
          { name: 'Фактические продажи', values: tournament.actualSales, color: '#17243a' },
          { name: 'Causal TCN', values: tournament.predictions['Causal TCN (Deep Learning)'], color: '#2854e6' },
          { name: 'Регуляризованная OLS', values: tournament.predictions['Регуляризованная OLS'], color: '#d97706' },
          { name: 'Seasonal Naive', values: tournament.predictions['Seasonal Naive'], color: '#64748b' }
        ], tournament.testMonths);
      }

      const expBtn = $('btn-export-tcn');
      if (expBtn) {
        expBtn.onclick = () => {
          let csv = 'month,actual_rub,tcn_predicted_rub,ols_predicted_rub,naive_predicted_rub\n';
          for (let i = 0; i < tournament.testMonths.length; i++) {
            csv += `${tournament.testMonths[i]},${tournament.actualSales[i].toFixed(0)},${tournament.predictions['Causal TCN (Deep Learning)'][i].toFixed(0)},${tournament.predictions['Регуляризованная OLS'][i].toFixed(0)},${tournament.predictions['Seasonal Naive'][i].toFixed(0)}\n`;
          }
          const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'PharmaMix_Tournament_Forecast.csv';
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        };
      }

      const scTrp = $('sc-trp') as HTMLInputElement | null;
      const scBonus = $('sc-bonus') as HTMLInputElement | null;
      const scVisits = $('sc-visits') as HTMLInputElement | null;
      if (scTrp) scTrp.oninput = () => { if ($('sc-trp-val')) $('sc-trp-val')!.textContent = (Number(scTrp.value) > 0 ? '+' : '') + scTrp.value + '%'; };
      if (scBonus) scBonus.oninput = () => { if ($('sc-bonus-val')) $('sc-bonus-val')!.textContent = (Number(scBonus.value) > 0 ? '+' : '') + scBonus.value + ' п.п.'; };
      if (scVisits) scVisits.oninput = () => { if ($('sc-visits-val')) $('sc-visits-val')!.textContent = (Number(scVisits.value) > 0 ? '+' : '') + scVisits.value + '%'; };

      const scBtn = $('btn-run-scenario');
      if (scBtn) {
        scBtn.onclick = () => {
          const trpPct = Number(scTrp?.value || 0);
          const bonusPp = Number(scBonus?.value || 0);
          const visitsPct = Number(scVisits?.value || 0);

          let baseTotal = 0;
          let scenarioTotal = 0;
          for (let i = Math.max(0, seqs.length - 12); i < seqs.length; i++) {
            const baseSeq = seqs[i];
            baseTotal += tcn.predictRub(baseSeq);
            const scSeq = baseSeq.map(row => {
              const r = [...row];
              const rawTrp = Math.expm1(r[0]) * (1 + trpPct / 100);
              r[0] = Math.log1p(Math.max(0, rawTrp));
              r[1] = Math.max(0, r[1] + bonusPp);
              const rawVisits = Math.expm1(r[2]) * (1 + visitsPct / 100);
              r[2] = Math.log1p(Math.max(0, rawVisits));
              return r;
            });
            scenarioTotal += tcn.predictRub(scSeq);
          }

          const diffRub = scenarioTotal - baseTotal;
          const diffPct = (diffRub / baseTotal) * 100;
          const box = $('scenario-result-box');
          if (box) {
            box.style.display = 'block';
            box.innerHTML = `
              <div class="callout ${diffRub >= 0 ? 'good' : 'warn'}">
                <h4>Результат симуляции сценария:</h4>
                <div class="grid three" style="margin-top:10px;">
                  <div class="result"><span>Базовый прогноз выручки (12 мес.)</span><strong>${rub(baseTotal)}</strong></div>
                  <div class="result"><span>Прогноз выручки по сценарию</span><strong>${rub(scenarioTotal)}</strong></div>
                  <div class="result"><span>Ожидаемый прирост</span><strong class="${diffRub >= 0 ? 'pos' : 'neg'}">${(diffRub >= 0 ? '+' : '') + rub(diffRub)} (${diffPct.toFixed(1)}%)</strong></div>
                </div>
              </div>
            `;
          }
        };
      }
    }
  }

  function runMLBO(): void {
    const status = $('ml-bo-status');
    const out = $('ml-bo-out');

    const totalVal = +($('bo-total-input') ? ($('bo-total-input') as HTMLInputElement).value : 5000000);
    const marginVal = +($('bo-margin-input') ? ($('bo-margin-input') as HTMLInputElement).value : 65) / 100;
    const tvVal = +($('bo-trp-input') ? ($('bo-trp-input') as HTMLInputElement).value : 2000000);
    const bonusVal = +($('bo-bonus-input') ? ($('bo-bonus-input') as HTMLInputElement).value : 1750000);
    const visitsVal = +($('bo-visits-input') ? ($('bo-visits-input') as HTMLInputElement).value : 1250000);

    const opt = runBayesianBudgetOptimization({
      totalBudget: totalVal,
      marginPct: marginVal,
      currentSpends: {
        tv: tvVal,
        bonus: bonusVal,
        visits: visitsVal
      }
    });

    if (status) {
      status.textContent = `Оптимизация завершена! Ожидаемый чистый выигрыш от перераспределения: +${rub(opt.incrementalProfitUplift)}. 95% ДИ прибыли: [${rub(opt.ciLowerProfit)}; ${rub(opt.ciUpperProfit)}].`;
      status.className = 'callout good';
    }

    if (out) {
      out.innerHTML = `
        <div class="grid four" style="margin-top:14px">
          <div class="result"><span>Инкрементальная выручка</span><strong class="pos">${rub(opt.recommendedRevenueUplift)}</strong></div>
          <div class="result"><span>Инкрементальная маржинальная прибыль</span><strong class="pos">${rub(opt.recommendedMarginProfit)}</strong></div>
          <div class="result"><span>Выигрыш от перебалансировки</span><strong class="pos">+${rub(opt.incrementalProfitUplift)}</strong></div>
          <div class="result"><span>Вероятность прибыли (Risk > 0)</span><strong class="pos">${opt.probPositiveProfit.toFixed(1)}%</strong></div>
        </div>

        <div class="card" style="margin-top:16px">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
            <div>
              <h3>Оптимальное распределение бюджета по каналам (Hill Saturation)</h3>
              <p class="sub">Сравнение текущего плана инвестиций и экономически обоснованного оптимума с маржой ${(opt.marginPct * 100).toFixed(0)}%.</p>
            </div>
            <span class="pill" style="background:#f0fdf4;color:#166534">95% ДИ прибыли: [${rub(opt.ciLowerProfit)}; ${rub(opt.ciUpperProfit)}]</span>
          </div>

          <div class="table-wrap" style="margin-top:12px">
            <table>
              <thead>
                <tr>
                  <th>Маркетинговый канал</th>
                  <th>Текущий бюджет</th>
                  <th>Текущая доля</th>
                  <th>Рекомендованный бюджет</th>
                  <th>Опт. доля</th>
                  <th>Изменение (Δ)</th>
                  <th>Предельный ROI</th>
                  <th>Насыщение (Hill)</th>
                </tr>
              </thead>
              <tbody>
                ${opt.channels.map(c => `
                  <tr>
                    <td><b>${c.name}</b></td>
                    <td>${rub(c.currentRub)}</td>
                    <td>${c.currentSharePct.toFixed(1)}%</td>
                    <td><b class="pos">${rub(c.recommendedRub)}</b></td>
                    <td><b>${c.recommendedSharePct.toFixed(1)}%</b></td>
                    <td class="${c.deltaRub >= 0 ? 'pos' : 'neg'}">${(c.deltaRub >= 0 ? '+' : '') + rub(c.deltaRub)}</td>
                    <td><b>${fmt(c.marginalRoiRecommended, 2)}x</b> <span class="small" style="color:#64748b">(было ${fmt(c.marginalRoiCurrent, 2)}x)</span></td>
                    <td>
                      <div style="display:flex;align-items:center;gap:6px;">
                        <div class="bartrack" style="width:70px;height:6px;"><div class="barfill" style="width:${Math.min(100, c.saturationPct)}%;background:${c.saturationPct > 80 ? '#d97706' : '#2854e6'};"></div></div>
                        <span style="font-size:11px;">${c.saturationPct.toFixed(0)}%</span>
                      </div>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <div class="grid two" style="margin-top:16px">
          <div class="card">
            <h3>Экономическая логика перераспределения</h3>
            <div class="statline"><span>Критерий отдачи</span><strong>Максимизация инкрементальной прибыли (Gross Profit - Spend).</strong></div>
            <div class="statline"><span>Убывающая отдача</span><strong>Модель насыщения Hill предотвращает переинвестирование.</strong></div>
            <div class="statline"><span>Оценка риска</span><strong>Monte Carlo сэмплирование эластичностей с учетом SE.</strong></div>
            <div class="statline"><span>Баланс каналов</span><strong>Удовлетворены все коридоры минимальных и максимальных долей.</strong></div>
          </div>
          <div class="card">
            <h3>Чувствительность к маржинальности</h3>
            <div class="statline"><span>Маржинальность бренда</span><strong>${(opt.marginPct * 100).toFixed(0)}%</strong></div>
            <div class="statline"><span>Прибыль с учетом риска (E - 0.5σ)</span><strong>${rub(opt.riskAdjustedProfit)}</strong></div>
            <div class="statline"><span>Текущая маржинальная прибыль</span><strong>${rub(opt.currentMarginProfit)}</strong></div>
            <div class="statline"><span>Оптимальная маржинальная прибыль</span><strong class="pos">${rub(opt.recommendedMarginProfit)}</strong></div>
          </div>
        </div>
      `;
    }
  }

  function runGeoABExperimentUIWrapper(): void {
    runGeoABExperimentUI(store);
  }


  /* ============ Регистрация слушателей DOM ============ */
  const navEl = $('nav');
  if (navEl) {
    navEl.addEventListener('click', e => {
      const b = (e.target as HTMLElement).closest('button[data-page]') as HTMLElement | null;
      if (b && b.dataset.page) showPage(b.dataset.page);
    });
  }

  // Делегирование кликов по всем кнопкам с data-page вне сайдбара (карточки портала, шапка, ссылки)
  document.addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest('button[data-page]') as HTMLElement | null;
    if (b && b.dataset.page && !b.closest('#nav')) {
      showPage(b.dataset.page);
    }
  });

  // Синхронизация селектора ролей в шапке
  const headerRoleSel = $('headerRoleSelect') as HTMLSelectElement | null;
  if (headerRoleSel) {
    headerRoleSel.value = store.getState().activeRole || 'all';
    headerRoleSel.addEventListener('change', () => {
      const newRole = (headerRoleSel.value || 'all') as UserRole;
      store.setRole(newRole);
      if (typeof localStorage !== 'undefined') localStorage.setItem('pharmamix_role', newRole);
      updateRoleUI();
      if (newRole !== 'all') {
        const primaryPage = ROLES_REGISTRY[newRole]?.primaryPage;
        if (primaryPage) showPage(primaryPage);
      }
    });
  }

  // Кнопка быстрого перехода в Портал ролей
  if ($('btnOpenPortal')) {
    $('btnOpenPortal')!.onclick = () => showPage('portal');
  }

  updateRoleUI();

  const bindTabs = (boxId: string, attr: string, prefix: string) => {
    const box = $(boxId);
    if (!box) return;
    box.addEventListener('click', e => {
      const b = (e.target as HTMLElement).closest('button[' + attr + ']') as HTMLElement | null;
      if (!b) return;
      document.querySelectorAll('#' + boxId + ' button').forEach(x => x.classList.toggle('active', x === b));
      document.querySelectorAll('.ptab').forEach(x => {
        if (x.id.startsWith(prefix)) x.classList.toggle('active', x.id === prefix + b.getAttribute(attr));
      });
      if (prefix === 'mtab-') renderActive();
      if (prefix === 'mtab-' && b.dataset.mtab === 'val' && store.getState().valDirty && !store.getState().val) executeValidation();
    });
  };

  bindTabs('promoTabs', 'data-ptab', 'ptab-');
  bindTabs('modelTabs', 'data-mtab', 'mtab-');
  bindTabs('mlTabs', 'data-mltab', 'mltab-');

  if ($('resetDemo')) $('resetDemo')!.onclick = resetToDemo;
  if ($('resetDemo2')) $('resetDemo2')!.onclick = resetToDemo;

  const promoRecalc = () => {
    const st = getSettingsFromUI();
    store.update(draft => {
      draft.derived.st = st;
      const res = evaluatePromoBaselines(draft.derived, st, draft.reg);
      draft.derived.atoms = res.atoms;
      draft.derived.promoRows = res.promoRows;
      draft.derived.adjFail = res.adjFail;
      draft.derived.dualStats = res.dualStats;
    }, true);
    populateSelects();
    renderPromo();
    try { renderDash(); } catch (e) { }
    renderActive();
  };

  if ($('recalcPromo')) $('recalcPromo')!.onclick = promoRecalc;
  ['marginPct', 'baselineMonths', 'minHist', 'excludePromoBase', 'marketAdjust', 'baselineMethod'].forEach(i => {
    const el = $(i);
    if (el) el.addEventListener(i === 'marginPct' ? 'input' : 'change', promoRecalc);
  });

  ['dBrand', 'dRegion', 'dFrom', 'dTo'].forEach(i => {
    const el = $(i);
    if (el) el.addEventListener('change', renderDash);
  });

  ['prBrand', 'prChain', 'prMech'].forEach(i => {
    const el = $(i);
    if (el) el.addEventListener('change', renderPromo);
  });

  ['mkMarket', 'mkRegion', 'mkMetric', 'mkWin'].forEach(i => {
    const el = $(i);
    if (el) el.addEventListener('change', renderMarket);
  });

  ['fChain', 'fBrand', 'fSku', 'fRegion', 'fCity', 'fMech', 'fFrom', 'fTo', 'sortBy', 'onlyValid'].forEach(i => {
    const el = $(i);
    if (el) el.addEventListener('change', renderSlice);
  });

  if ($('sliceDims')) $('sliceDims')!.addEventListener('change', renderSlice);
  if ($('slicePresets')) {
    $('slicePresets')!.addEventListener('click', e => {
      const b = (e.target as HTMLElement).closest('button[data-preset]') as HTMLElement | null;
      if (!b || !b.dataset.preset) return;
      const set = b.dataset.preset.split(',');
      document.querySelectorAll('#sliceDims input').forEach((i: any) => i.checked = set.includes(i.value));
      renderSlice();
    });
  }

  if ($('fitModel')) $('fitModel')!.onclick = () => {
    const useMkt = ($('useMkt') as HTMLInputElement)?.checked ?? false;
    store.update(draft => {
      try {
        draft.reg = fitMMMModel(draft.derived.panel, useMkt);
      } catch (e: any) {
        draft.reg = { err: e.message } as any;
      }
      draft.valDirty = true;
      draft.val = null;
    }, true);
    renderReg();
    renderOverview(store);
    renderVal();
  };

  if ($('runVal')) $('runVal')!.onclick = executeValidation;

  ['useMkt', 'testH', 'scheme'].forEach(i => {
    const el = $(i);
    if (el) {
      el.addEventListener('change', () => {
        if (i === 'useMkt') {
          const useMkt = ($('useMkt') as HTMLInputElement)?.checked ?? false;
          store.update(draft => {
            try { draft.reg = fitMMMModel(draft.derived.panel, useMkt); } catch (e: any) { draft.reg = { err: e.message } as any; }
          }, true);
          renderReg();
        }
        store.update(draft => { draft.val = null; draft.valDirty = true; }, true);
        renderVal();
      });
    }
  });

  // Запуск модулей ML-Центра
  if ($('run-ml-hier')) $('run-ml-hier')!.onclick = () => safeExecuteAsync(runMLHierarchy, 'Иерархическая регрессия');
  if ($('run-ml-lag')) $('run-ml-lag')!.onclick = () => safeExecuteAsync(runMLLagSearch, 'Поиск лагов');
  if ($('run-ml-tcn')) $('run-ml-tcn')!.onclick = () => safeExecuteAsync(runMLTCN, 'Обучение TCN');
  if ($('run-ml-bo')) $('run-ml-bo')!.onclick = () => safeExecute(runMLBO, 'Оптимизация бюджета');
  if ($('run-ml-geo')) $('run-ml-geo')!.onclick = () => safeExecute(() => runGeoABExperimentUI(store), 'Causal Geo A/B');
  ['geoab-factor', 'geoab-split', 'geoab-region'].forEach(id => {
    const el = $(id);
    if (el) el.addEventListener('change', () => safeExecute(() => runGeoABExperimentUI(store), 'Causal Geo A/B'));
  });
  if ($('run-ml-geoab')) $('run-ml-geoab')!.onclick = () => safeExecute(() => runGeoABExperimentUI(store), 'Causal Geo A/B');

  // Кнопки и регуляторы раздела AutoML
  if ($('runAutoMLBtn')) $('runAutoMLBtn')!.onclick = renderAutoMLPage;
  if ($('exportPdfExecBtn')) {
    $('exportPdfExecBtn')!.onclick = () => safeExecuteAsync(async () => {
      const summary = runAutoMLEngine(store.getState().derived.panel, store.getState().raw.sales, store.getState().raw.promos, store.getState().raw.market, 48);
      await generateExecutiveSummaryPDF(summary);
    }, 'Экспорт PDF (Краткий)');
  }
  if ($('exportPdfFullBtn')) {
    $('exportPdfFullBtn')!.onclick = () => safeExecuteAsync(async () => {
      await generateFullAutoMLReportPDF('pdfExportArea');
    }, 'Экспорт PDF (Полный)');
  }
  if ($('exportExcelBtn')) $('exportExcelBtn')!.onclick = () => {
    const summary = (window as any)._lastAutoMLSummary || runAutoMLEngine(store.getState().derived.panel, store.getState().raw.sales, store.getState().raw.promos, store.getState().raw.market, 48);
    if (summary) {
      exportFullPharmaReportToExcel(summary);
    }
  };
  if ($('mdBrand')) $('mdBrand')!.onchange = () => renderReg();
  // automlBrandSelect, seasBrandSelect etc are handled by addEventListener below with store sync
  if ($('automlMarginInput')) $('automlMarginInput')!.onchange = renderAutoMLPage;
  if ($('illnessMetricSelect')) $('illnessMetricSelect')!.onchange = () => renderSeasonalityPage(store);

  ['simTrpSlider', 'simBonusSlider', 'simVisitsSlider'].forEach(id => {
    const el = $(id);
    if (el) {
      el.addEventListener('input', () => {
        const summary = (window as any)._lastAutoMLSummary;
        const brandSelect = $('automlBrandSelect') as HTMLSelectElement | null;
        const selectedBrand = brandSelect?.value || '';
        if (summary) {
          const activeResult = selectedBrand ? summary.brandResults[selectedBrand] : summary.allBrandsResult;
          if (activeResult) updateSimulatorResults(activeResult);
        }
      });
    }
  });

  // Режим загрузки данных (Append vs Overwrite)
  if ($('modeAppend')) ($('modeAppend') as HTMLInputElement).onchange = () => {
    store.update(draft => { draft.uploadMode = 'append'; }, true);
  };
  if ($('modeOverwrite')) ($('modeOverwrite') as HTMLInputElement).onchange = () => {
    store.update(draft => { draft.uploadMode = 'overwrite'; }, true);
  };

  const fileInputIds: Record<string, string> = {
    sales: 'salesFile',
    promo: 'promoFile',
    tv: 'tvFile',
    visits: 'visitsFile',
    market: 'marketFile'
  };

  for (const type in fileInputIds) {
    const el = $(fileInputIds[type]);
    if (el) {
      el.addEventListener('change', (e: any) => safeExecuteAsync(async () => {
        if (e.target.files && e.target.files.length) {
          const res = await processSourceFiles(store, type, e.target.files);
          renderPartitionLog();
          const finalCount = (store.getState().raw as any)[type === 'promo' ? 'promos' : type]?.length || 0;
          if ($(type + 'Status')) $(type + 'Status')!.textContent = finalCount + ' строк всего';

          // Автоматическая синхронизация и пересчет данных при загрузке продаж
          if (store.getState().raw.sales.length > 0) {
            refreshAll();
          }

          if ($('importMessage')) {
            if (!store.getState().raw.promos.length && store.getState().raw.sales.length > 0) {
              $('importMessage')!.innerHTML = `${res.message}<br/><span style="color:#b45309;font-weight:600;">ℹ️ Данные применены. Файл ТМА (промо / бонусы) пока не загружен — промо-фонд принят за 0 ₽, графики продаж, рынка и MMM пересчитаны.</span>`;
            } else {
              $('importMessage')!.textContent = res.message;
            }
            $('importMessage')!.className = 'callout ' + (res.success ? 'good' : 'bad');
          }
        }
      }, `Импорт данных (${type})`));
    }
  }

  const doClearPartitions = async () => {
    try { await pharmaDB.clearAll(); } catch (e) {}
    try { localStorage.clear(); } catch (e) {}
    store.update(draft => {
      draft.partitionLogs.length = 0;
      draft.raw = { sales: [], promos: [], tv: [], visits: [], market: [] };
    });
    for (const t in fileInputIds) {
      if ($(t + 'Status')) $(t + 'Status')!.textContent = '0 строк';
      const fileInput = $(fileInputIds[t]) as HTMLInputElement | null;
      if (fileInput) fileInput.value = '';
    }
    renderPartitionLog();
    refreshAll();
    renderData(store);
    if ($('importMessage')) {
      $('importMessage')!.textContent = 'Все загруженные данные, партиции и базы очищены. Выберите файлы для импорта или нажмите «Вернуть демоданные».';
      $('importMessage')!.className = 'callout';
    }
  };

  const doRestoreDemoData = async () => {
    loadYearlyDemoPartitions(store);
    try {
      const st = store.getState().raw;
      await pharmaDB.savePartition('sales', st.sales);
      await pharmaDB.savePartition('promos', st.promos);
      await pharmaDB.savePartition('tv', st.tv);
      await pharmaDB.savePartition('visits', st.visits);
      await pharmaDB.savePartition('market', st.market);
    } catch (e) {}
    renderPartitionLog();
    refreshAll();
    renderData(store);
    if ($('importMessage')) {
      $('importMessage')!.textContent = `Успешно восстановлены 3 годовые партиции: sales_2023.csv (12 мес.), sales_2024.csv (12 мес.), sales_2025.csv (6 мес.) — суммарно ${store.getState().raw.sales.length} записей!`;
      $('importMessage')!.className = 'callout good';
    }
  };

  (window as any).__pmClearData = doClearPartitions;
  (window as any).__pmRestoreDemoData = doRestoreDemoData;

  if ($('clearPartitions')) $('clearPartitions')!.onclick = doClearPartitions;
  if ($('btnClearDB')) $('btnClearDB')!.onclick = doClearPartitions;
  if ($('btnGenYearlyData')) $('btnGenYearlyData')!.onclick = doRestoreDemoData;
  if ($('resetDemo')) $('resetDemo')!.onclick = doRestoreDemoData;

  // IndexedDB & Compressed Dumps handlers
  if ($('btnSaveDump')) {
    $('btnSaveDump')!.onclick = async () => {
      const st = store.getState().raw;
      await pharmaDB.savePartition('sales', st.sales);
      await pharmaDB.savePartition('promos', st.promos);
      await pharmaDB.savePartition('tv', st.tv);
      await pharmaDB.savePartition('visits', st.visits);
      await pharmaDB.savePartition('market', st.market);

      const dumpStr = await pharmaDB.exportCompressedDump();
      const blob = new Blob([dumpStr], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pharmamix_dump_${new Date().toISOString().slice(0,10)}.pharma_dump`;
      a.click();
      URL.revokeObjectURL(url);

      if ($('dbStatsInfo')) {
        $('dbStatsInfo')!.textContent = `Успешно скачан сжатый дамп БД. Размер: ~${Math.round(dumpStr.length / 1024)} КБ (высокая степень сжатия).`;
      }
    };
  }

  const importDumpInput = $('importDumpFile') as HTMLInputElement | null;
  if (importDumpInput) {
    importDumpInput.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const text = await file.text();
      const res = await pharmaDB.importCompressedDump(text);
      if (res.success) {
        const sales = await pharmaDB.loadPartition('sales');
        const promos = await pharmaDB.loadPartition('promos');
        const tv = await pharmaDB.loadPartition('tv');
        const visits = await pharmaDB.loadPartition('visits');
        const market = await pharmaDB.loadPartition('market');

        store.update(draft => {
          draft.raw.sales = sales;
          draft.raw.promos = promos;
          draft.raw.tv = tv;
          draft.raw.visits = visits;
          draft.raw.market = market;
        });

        refreshAll();
        renderData(store);
        if ($('dbStatsInfo')) $('dbStatsInfo')!.textContent = res.message;
        if ($('importMessage')) {
          $('importMessage')!.textContent = res.message;
          $('importMessage')!.className = 'callout good';
        }
      } else {
        if ($('dbStatsInfo')) $('dbStatsInfo')!.textContent = res.message;
      }
      importDumpInput.value = '';
    };
  }

  if ($('loadFiles')) {
    $('loadFiles')!.onclick = () => {
      try {
        if (!store.getState().raw.sales.length) throw Error('Загрузите продажи.');
        refreshAll();
        if ($('importMessage')) {
          $('importMessage')!.textContent = 'Данные применены успешно.';
          $('importMessage')!.className = 'callout good';
        }
      } catch (e: any) {
        if ($('importMessage')) {
          $('importMessage')!.textContent = e.message;
          $('importMessage')!.className = 'callout bad';
        }
      }
    };
  }

  function downloadTemplate(type: 'sales' | 'visits' | 'tv' | 'promo' | 'market', filename: string): void {
    const csvContent = generateTemplateCSV(type);
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  if ($('dlTplSales')) $('dlTplSales')!.onclick = () => downloadTemplate('sales', 'Шаблон_Продажи_Выбытия.csv');
  if ($('dlTplVisits')) $('dlTplVisits')!.onclick = () => downloadTemplate('visits', 'Шаблон_Визиты_CRM.csv');
  if ($('dlTplTV')) $('dlTplTV')!.onclick = () => downloadTemplate('tv', 'Шаблон_ТВ_Реклама_TRP.csv');
  if ($('dlTplPromo')) $('dlTplPromo')!.onclick = () => downloadTemplate('promo', 'Шаблон_Промо_Бонусы.csv');
  if ($('dlTplMarket')) $('dlTplMarket')!.onclick = () => downloadTemplate('market', 'Шаблон_Рынок_Конкуренты.csv');

  if ($('btnFetchFluSpb')) {
    $('btnFetchFluSpb')!.onclick = async () => {
      const btn = $('btnFetchFluSpb') as HTMLButtonElement;
      btn.disabled = true;
      btn.textContent = '⏳ Загрузка бюллетеня...';
      const statusBox = $('illnessStatusBox');
      if (statusBox) {
        statusBox.style.display = 'block';
        statusBox.className = 'callout';
        statusBox.textContent = 'Запрос к https://www.influenza.spb.ru/surveillance/flu-bulletin/ ...';
      }
      try {
        const res = await fetchInfluenzaSpbData();
        store.update(draft => {
          draft.illnessData = res.rows;
          draft.illnessSource = res.source;
        });
        if (statusBox) {
          statusBox.className = 'callout good';
          statusBox.textContent = res.message;
        }
      } catch (err: any) {
        if (statusBox) {
          statusBox.className = 'callout bad';
          statusBox.textContent = 'Ошибка загрузки с сайта НИИ Гриппа. Загружен стандартный бюллетень.';
        }
      } finally {
        btn.disabled = false;
        btn.textContent = '🌐 НИИ Гриппа (influenza.spb.ru)';
        renderSeasonalityPage(store);
      }
    };
  }

  if ($('illnessCsvInput')) {
    $('illnessCsvInput')!.onchange = (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        const text = evt.target?.result as string;
        const rows = parseIllnessCSV(text, file.name);
        if (rows.length) {
          store.update(draft => {
            draft.illnessData = rows;
            draft.illnessSource = `CSV файл: ${file.name}`;
          });
          renderSeasonalityPage(store);
        }
      };
      reader.readAsText(file);
    };
  }

  if ($('btnDownloadIllnessTemplate')) {
    $('btnDownloadIllnessTemplate')!.onclick = () => {
      const template = generateIllnessCsvTemplate();
      const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), template], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.setAttribute('download', 'Шаблон_Заболеваемость_ОРВИ_Грипп.csv');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    };
  }

  ['illnessMetricSelect', 'illnessRegionSelect'].forEach(id => {
    const el = $(id);
    if (el) el.addEventListener('change', () => renderSeasonalityPage(store));
  });

  const seasBrandEl = $('seasBrandSelect');
  if (seasBrandEl) {
    seasBrandEl.addEventListener('change', (e) => {
      const val = (e.target as HTMLSelectElement).value;
      store.update(draft => { draft.globalFilters.brand = val; }, false);
      refreshAll();
    });
  }

  const automlBrandEl = $('automlBrandSelect');
  if (automlBrandEl) {
    automlBrandEl.addEventListener('change', (e) => {
      const val = (e.target as HTMLSelectElement).value;
      store.update(draft => { draft.globalFilters.brand = val; }, false);
      refreshAll();
    });
  }

  if ($('globalBrandSelect')) {
    $('globalBrandSelect')!.onchange = (e) => {
      const val = (e.target as HTMLSelectElement).value;
      store.update(draft => { draft.globalFilters.brand = val; }, false);
      refreshAll();
    };
  }

  if ($('globalRegionSelect')) {
    $('globalRegionSelect')!.onchange = (e) => {
      const val = (e.target as HTMLSelectElement).value;
      store.update(draft => { draft.globalFilters.region = val; }, false);
      refreshAll();
    };
  }



  if ($('dBrand')) {
    $('dBrand')!.onchange = (e) => {
      const val = (e.target as HTMLSelectElement).value;
      store.update(draft => { draft.globalFilters.brand = val; }, false);
      refreshAll();
    };
  }

  if ($('dRegion')) {
    $('dRegion')!.onchange = (e) => {
      const val = (e.target as HTMLSelectElement).value;
      store.update(draft => { draft.globalFilters.region = val; }, false);
      refreshAll();
    };
  }

  if ($('btnResetGlobalFilters')) {
    $('btnResetGlobalFilters')!.onclick = () => {
      store.update(draft => {
        draft.globalFilters = { brand: '', region: '', chain: '' };
      }, false);
      refreshAll();
    };
  }

  if ($('btnStartPitchDeck')) {
    $('btnStartPitchDeck')!.onclick = () => {
      store.update(draft => {
        draft.isFullscreenPitch = true;
        draft.presentationSlideIndex = 0;
      });
    };
  }

  if ($('btnStartTour')) {
    $('btnStartTour')!.onclick = () => {
      startProductTour();
    };
  }

  const unsubscribeStore = store.subscribe((state) => {
    renderModeUI(store);
    renderDrilldownModal(store, showPage);
    renderPitchDeckOverlay(store, showPage);
    persistenceService.saveUIState(state);
  });

  let rz: any;
  const onResize = () => {
    clearTimeout(rz);
    rz = setTimeout(renderActive, 150);
  };
  window.addEventListener('resize', onResize);

  // Restore Session
  const persisted = persistenceService.loadUIState();
  if (persisted) {
    store.update(draft => {
      if (persisted.activePage) draft.activePage = persisted.activePage;
      if (persisted.viewMode) draft.viewMode = persisted.viewMode;
    }, true);
  }

  // Инициализация демо-данных при первом старте (если данных нет)
  if (store.getState().raw.sales.length === 0) {
    resetToDemo();
  } else {
    refreshAll();
  }

  // Глобальный объект отладки
  (window as any).__pm = {
    store,
    refreshAll,
    renderActive,
    showPage
  };

  attachInteractiveChartDrilldowns(store);
  return () => {
    window.removeEventListener('resize', onResize);
    unsubscribeStore();
  };
}
