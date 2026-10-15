import { PharmaDataStore, getFilteredRaw } from '../../core/store';
import { uniq, esc, rub, traceMap } from '../../utils/math';
import { kpiHtml, drawSTLDecompositionChart, drawIllnessCorrelationChart, drawPromoSeasonalElasticityChart, table } from '../chartRenderer';
import { generateSeasonalityReport } from '../../modules/mmm-engine/seasonalityEngine';
import { calculateIllnessCorrelations, getFluSpbOfficialDataset } from '../../modules/seasonality-engine/seasonality_engine';
import { generateMarketInsights } from '../../modules/insights-engine/insightsGenerator';

/**
 * Section for Market & Seasonality Analysis.
 */
export function renderSeasonalityPage(store: PharmaDataStore): void {
  const getEl = (id: string) => document.querySelector(`.page.active #${id}`) as any || document.getElementById(id);
  const container = getEl('page-seasonality-analysis') || getEl('page-seasonality');
  if (container) {
    container.style.display = 'block';
  }

  const $ = (id: string) => getEl(id);
  const state = store.getState();
  if (!state || !state.raw) return;

  const reportError = (section: string, err: any) => {
    console.error(`[Seasonality Isolation] Error in ${section}:`, err);
    const box = $(`error-${section}`);
    if (box) {
      box.style.display = 'block';
      box.innerHTML = `<div class="callout bad"><b>⚠️ Ошибка в блоке ${section}:</b> ${esc(err.message || String(err))}</div>`;
    }
  };

  let brands: string[] = [];
  let raw: any = null;
  let illnessData: any[] = [];
  let months: string[] = [];
  let salesSeries: number[] = [];
  let promoSeries: number[] = [];
  let report: any = null;
  let illCorr: any = null;
  let richIllnessProfile: any[] = [];
  let selectedRegion = 'Все регионы';
  let selectedMetric: 'all' | 'arvi' | 'flu' = 'all';

  // --- BLOCK 1: Data Preparation ---
  try {
    raw = getFilteredRaw(state.raw, state.globalFilters);
    raw = getFilteredRaw(state.raw, state.globalFilters);
    const rawSales = (state.raw && state.raw.sales) || [];
    brands = uniq(traceMap(rawSales, 'rawSales', (r: any) => r ? r.brand : '')).filter(Boolean).sort();

    if (!state.illnessData || !state.illnessData.length) {
      const defaultDataset = getFluSpbOfficialDataset();
      store.update(draft => {
        draft.illnessData = defaultDataset || [];
        draft.illnessSource = 'НИИ Гриппа им. А.А. Смородинцева (influenza.spb.ru)';
      }, true); // Silent update
      // Используем новый датасет сразу в текущем рендере
      illnessData = defaultDataset || [];
    } else {
      illnessData = state.illnessData;
    }

    const brandSelect = $('seasBrandSelect') as HTMLSelectElement | null;
    if (brandSelect && brandSelect.options.length <= 1) {
      brandSelect.innerHTML = '<option value="">Все бренды (Сводный портфель)</option>' +
        traceMap(brands, 'brands (dropdown)', (b: any) => `<option value="${esc(b)}">${esc(b)}</option>`).join('');
    }
    if (brandSelect && state.globalFilters.brand) {
      brandSelect.value = state.globalFilters.brand;
    }

    const regSelect = $('illnessRegionSelect') as HTMLSelectElement | null;
    if (regSelect) {
      const availableRegions = uniq(traceMap(illnessData, 'illnessData (regions)', (r: any) => r ? r.region : '')).filter(Boolean);
      regSelect.innerHTML = '<option value="Все регионы">Все регионы (РФ)</option>' +
        traceMap((availableRegions || []).filter((r: string) => r !== 'Все регионы'), 'availableRegions (dropdown)', (r: string) => `<option value="${esc(r)}">${esc(r)}</option>`).join('');
      if (state.globalFilters.region && availableRegions.includes(state.globalFilters.region)) {
        regSelect.value = state.globalFilters.region;
      }
    }

    const metricSelect = $('illnessMetricSelect') as HTMLSelectElement | null;
    selectedMetric = (metricSelect?.value || 'all') as 'all' | 'arvi' | 'flu';
    selectedRegion = state.globalFilters.region || regSelect?.value || 'Все регионы';

    const selectedBrand = state.globalFilters.brand || brandSelect?.value || '';
    // 'raw' уже отфильтрован по globalFilters. Используем его напрямую.
    // Если выбран локальный бренд, который отличается от глобального, 
    // это значит refreshAll еще не дошел или есть рассинхрон.
    // Но обычно в PharmaMix local select = global filter update.
    const filteredSales = (raw.sales || []) || [];
    const filteredPromos = (raw.promos || []) || [];
    months = state.derived?.months || [];
    
    if (!months || !months.length) {
      if (container) container.innerHTML = '<div class="callout warn" style="margin:20px;">Нет данных для анализа сезональности. Пожалуйста, загрузите продажи.</div>';
      return;
    }

    const salesByMonth = new Map<string, number>();
    (filteredSales || []).forEach((r: any) => {
      if (r && r.month) {
        salesByMonth.set(r.month, (salesByMonth.get(r.month) || 0) + (r.salesRub || 0));
      }
    });

    const promoByMonth = new Map<string, number>();
    (filteredPromos || []).forEach((p: any) => {
      if (p && p.month) {
        promoByMonth.set(p.month, (promoByMonth.get(p.month) || 0) + (p.bonusPct || 10));
      }
    });

    salesSeries = traceMap(months, 'months (salesSeries)', (m: any) => salesByMonth.get(m) || 0);
    promoSeries = traceMap(months, 'months (promoSeries)', (m: any) => promoByMonth.get(m) || 0);

    if (salesSeries.length < 2) {
      if (container) container.innerHTML = '<div class="callout warn" style="margin:20px;">Недостаточно данных для анализа сезональности (нужно минимум 2 месяца).</div>';
      return;
    }

    report = generateSeasonalityReport(
      selectedBrand || 'Сводный портфель',
      months,
      salesSeries,
      promoSeries
    );

    const salesForCorr = traceMap(months, 'months (salesForCorr)', (m: any) => ({ month: m, rub: salesByMonth.get(m) || 0 }));
    illCorr = calculateIllnessCorrelations(salesForCorr, illnessData, selectedRegion);

    const maxSalesVal = Math.max(...salesSeries, 1);
    const illnessFiltered = (illnessData || []).filter((r: any) => r && (selectedRegion === 'Все регионы' ? r.region === 'Все регионы' : r.region === selectedRegion));
    const illMap = new Map<string, any>();
    (illnessFiltered || []).forEach((r: any) => { if (r && r.month) illMap.set(r.month, r); });

    richIllnessProfile = traceMap(months, 'months (richIllnessProfile)', (m: any) => {
      const ill = illMap.get(m);
      const salesRub = salesByMonth.get(m) || 0;
      return {
        month: m,
        arviIndex: ill ? ill.arviIndex : 100,
        fluIndex: ill ? ill.fluIndex : 50,
        brandSalesNorm: Math.round((salesRub / maxSalesVal) * 100)
      };
    });
  } catch (err) {
    reportError('DataPrep', err);
    return;
  }

  // --- BLOCK 2: KPIs ---
  try {
    const seasKpis = $('seasKpis');
    if (seasKpis && report && illCorr) {
      seasKpis.className = 'grid four';
      seasKpis.style.marginBottom = '16px';
      seasKpis.innerHTML = kpiHtml([
        ['Пиковый месяц', report.peakMonth || '—', `Максимальный спрос`],
        ['Минимальный месяц', report.lowMonth || '—', `Сезонный спад`],
        ['Сила сезональности', `${report.seasonalityStrength || 0}%`, 'Размах колебаний'],
        ['Корреляция с ОРВИ/Грипп', `${(illCorr.dominantCorr || 0) > 0 ? '+' : ''}${illCorr.dominantCorr || 0}`, `Фактор: ${illCorr.dominantFactor || '—'}`]
      ]);
    }
  } catch (err) {
    reportError('KPIs', err);
  }

  // --- BLOCK 3: Table ---
  try {
    const seasTbl = $('seasTable');
    if (seasTbl && report?.stl?.seasonalIndices) {
      const entries = Object.entries(report.stl.seasonalIndices);
      const tableRows = (entries || []).map(([month, factor]) => [
        month,
        factor + '%',
        (Number(factor) > 110 ? 'Высокий' : Number(factor) < 90 ? 'Низкий' : 'Средний')
      ]);
      table(seasTbl, ['Месяц', 'Индекс (%)', 'Тип сезона'], tableRows);
    }
  } catch (err) {
    reportError('Table', err);
  }

  // --- BLOCK 4: Status Box ---
  try {
    const statusBox = $('illnessStatusBox');
    if (statusBox && illCorr) {
      statusBox.style.display = 'block';
      statusBox.className = 'callout good';
      const illnessFilteredCount = (illnessData || []).filter((r: any) => r && (selectedRegion === 'Все регионы' ? r.region === 'Все регионы' : r.region === selectedRegion)).length;
      statusBox.innerHTML = `📡 <b>Источник данных:</b> ${esc(state.illnessSource)} | <b>Регион:</b> ${esc(selectedRegion)} | <b>Записей:</b> ${illnessFilteredCount} | <b>Эпидемический риск:</b> <span class="badge ${(illCorr.epidemicRisk || '').includes('Высокий') ? 'warn' : 'ok'}">${illCorr.epidemicRisk || 'Низкий'}</span>`;
    }
  } catch (err) {
    reportError('StatusBox', err);
  }

  // --- BLOCK 5: Charts (Async) ---
  requestAnimationFrame(() => {
    // Проверяем, что мы все еще на той же странице и контейнер активен
    if (!container || container.style.display === 'none') return;

    // 5.1 STL Chart
    try {
      const stlCvs = $('stlCanvas') as HTMLCanvasElement | null;
      if (stlCvs && report?.stl) {
        drawSTLDecompositionChart(stlCvs, report.stl);
      }
    } catch (err) {
      reportError('STLChart', err);
    }

    // 5.2 Illness Chart
    try {
      const illCvs = $('illnessCanvas') as HTMLCanvasElement | null;
      if (illCvs && richIllnessProfile && richIllnessProfile.length > 0) {
        drawIllnessCorrelationChart(illCvs, richIllnessProfile, selectedMetric);
      }
    } catch (err) {
      reportError('IllnessChart', err);
    }

    // 5.3 Promo Chart
    try {
      const promoCvs = $('promoSeasonalCanvas') as HTMLCanvasElement | null;
      if (promoCvs && report?.promoElasticity) {
        drawPromoSeasonalElasticityChart(promoCvs, report.promoElasticity);
      }
    } catch (err) {
      reportError('PromoChart', err);
    }
  });

  // --- BLOCK 6: Insights ---
  try {
    if ($('seasInsightsBox')) {
      const insights = generateMarketInsights(state, selectedRegion);
      if (insights) {
        $('seasInsightsBox')!.innerHTML = `
          <div style="font-weight:700;font-size:14px;margin-bottom:6px;color:#0f172a;">${insights.title}</div>
          ${insights.html}
        `;
      }
    }
  } catch (err) {
    reportError('Insights', err);
  }

}
