import {
  Chart,
  registerables
} from 'chart.js';
import { DataCheckItem } from '../types/pharma';
import { PAL, esc, short, rub, pct, fmt, traceMap } from '../utils/math';
import { MonthlyContributionPoint, SHAPValuePoint } from '../modules/mmm-engine/automlEngine';

Chart.register(...registerables);

// Хранилище инстансов чартов для их уничтожения перед повторным рендером (избежание утечек и наложений)
const chartInstances = new Map<HTMLCanvasElement, Chart>();

export function setChart(canvas: HTMLCanvasElement, chart: Chart) {
  if (canvas) {
    canvas.style.touchAction = 'manipulation';
  }
  chartInstances.set(canvas, chart);
}

export function cleanupChart(canvas: HTMLCanvasElement): void {
  if (!canvas) return;
  
  // 1. Из нашей карты
  const existing = chartInstances.get(canvas);
  if (existing) {
    try {
      if (typeof existing.destroy === 'function') {
        existing.destroy();
      }
    } catch (e) {}
    chartInstances.delete(canvas);
  }

  // 2. Глобальный поиск инстанса Chart.js для этого канваса
  try {
    const chartJSInstance = Chart.getChart(canvas);
    if (chartJSInstance && typeof chartJSInstance.destroy === 'function') {
      chartJSInstance.destroy();
    }
  } catch (e) {}
}

export function destroyOrphanedCharts(): void {
  // 1. Очистка по нашей карте инстансов
  for (const [canvas, chart] of Array.from(chartInstances.entries())) {
    try {
      // Если канвас отсоединен, не имеет родителя или находится на НЕАКТИВНОЙ странице - уничтожаем чарт
      const isOrphaned = !canvas || !canvas.isConnected || !canvas.ownerDocument || !canvas.parentElement;
      const isHiddenPage = canvas && canvas.closest && canvas.closest('.page:not(.active)');
      
      if (isOrphaned || isHiddenPage) {
        chart.destroy();
        chartInstances.delete(canvas);
      }
    } catch (e) {
      chartInstances.delete(canvas);
    }
  }

  // 2. Глобальная очистка всех инстансов Chart.js (включая те, что не в нашей карте)
  const allInstances = Object.values(Chart.instances);
  for (const chart of allInstances) {
    if (!chart) continue;
    try {
      const cvs = chart.canvas;
      const isOrphaned = !cvs || !cvs.isConnected || !cvs.ownerDocument || !cvs.parentElement;
      const isHiddenPage = cvs && cvs.closest && cvs.closest('.page:not(.active)');

      if (isOrphaned || isHiddenPage) {
        chart.destroy();
      }
    } catch (e) {
      // Игнорируем ошибки при уничтожении
    }
  }
}

/**
 * Базовый линейный график
 */
export function drawChart(
  canvas: HTMLCanvasElement,
  series: Array<{ name: string; values: (number | null)[]; color?: string; dash?: number[] }>,
  labels: string[],
  o: { zero?: boolean; fmt?: (v: number) => string; padL?: number; stacked?: boolean; fill?: boolean; unit?: string; vLineIndex?: number; vLineLabel?: string } = {}
): void {
  if (!canvas || !(canvas instanceof HTMLCanvasElement)) return;
  if (!canvas.isConnected || !canvas.ownerDocument || !canvas.parentElement || !canvas.parentNode) return;
  
  const isVisible = canvas.offsetWidth > 0 || canvas.offsetHeight > 0 || canvas.offsetParent !== null;
  if (!isVisible) return;

  cleanupChart(canvas);

  const unit = o.unit !== undefined ? o.unit : (o.stacked ? 'млн ₽' : '');

  const datasets = traceMap(series || [], 'drawChart series', (s, i) => ({
    label: s.name,
    data: s.values,
    borderColor: s.color || PAL[i % PAL.length],
    backgroundColor: (s.color || PAL[i % PAL.length]) + (o.stacked || o.fill ? '55' : '22'),
    borderDash: s.dash || [],
    borderWidth: 2,
    pointRadius: (labels || []).length <= 24 ? 3 : 0,
    pointHoverRadius: 5,
    tension: 0.3,
    fill: o.stacked || o.fill ? true : false
  }));

  const customPlugins: any[] = [];
  if (o.vLineIndex !== undefined) {
    customPlugins.push({
      id: 'verticalBoundaryLine',
      afterDraw: (chartInstance: any) => {
        try {
          const xAxis = chartInstance.scales.x;
          const yAxis = chartInstance.scales.y;
          if (!xAxis || !yAxis) return;
          const xPos = xAxis.getPixelForTick(o.vLineIndex!);
          if (xPos === undefined || isNaN(xPos)) return;
          const ctx = chartInstance.ctx;
          ctx.save();
          ctx.beginPath();
          ctx.setLineDash([5, 5]);
          ctx.lineWidth = 2;
          ctx.strokeStyle = '#dc2626';
          ctx.moveTo(xPos, yAxis.top);
          ctx.lineTo(xPos, yAxis.bottom);
          ctx.stroke();

          const text = o.vLineLabel || '📍 Граница: Факт | Прогноз';
          ctx.font = 'bold 11px sans-serif';
          const textWidth = ctx.measureText(text).width;
          ctx.fillStyle = 'rgba(220, 38, 38, 0.12)';
          ctx.fillRect(xPos + 4, yAxis.top + 4, textWidth + 12, 20);
          ctx.strokeStyle = '#dc2626';
          ctx.lineWidth = 1;
          ctx.strokeRect(xPos + 4, yAxis.top + 4, textWidth + 12, 20);

          ctx.fillStyle = '#dc2626';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(text, xPos + 10, yAxis.top + 14);
          ctx.restore();
        } catch (e) {}
      }
    });
  }

  try {
    const chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: labels || [],
        datasets: datasets
      },
      plugins: customPlugins,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
          duration: 800,
          easing: 'easeInOutQuart'
        },
        plugins: {
          legend: {
            display: true,
            position: 'bottom',
            labels: {
              boxWidth: 12,
              usePointStyle: true,
              pointStyle: 'circle',
              font: { size: 11 }
            }
          },
          tooltip: {
            mode: 'index',
            intersect: false,
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            titleFont: { size: 13, weight: 'bold' },
            bodyFont: { size: 12 },
            padding: 12,
            cornerRadius: 8,
            callbacks: {
              title: (items) => {
                if (!items || !items.length) return '';
                const label = items[0].label;
                if (o.stacked) {
                  const total = items.reduce((sum, item) => sum + (Number(item.parsed.y) || 0), 0);
                  const totalFormatted = o.fmt ? o.fmt(total) : `${total.toFixed(1)}${unit ? ' ' + unit : ''}`;
                  return `${label}  |  Всего: ${totalFormatted}`;
                }
                return label;
              },
              label: (context) => {
                let label = context.dataset.label || '';
                const val = context.parsed.y;
                if (val === null || val === undefined) return label;
                const formattedVal = o.fmt ? o.fmt(val) : `${val.toFixed(1)}${unit ? ' ' + unit : ''}`;

                if (o.stacked) {
                  const dataIndex = context.dataIndex;
                  const chartInstance = context.chart;
                  let total = 0;
                  chartInstance.data.datasets.forEach(ds => {
                    total += Number(ds.data[dataIndex]) || 0;
                  });
                  const sharePct = total > 0 ? ((val / total) * 100).toFixed(1) : '0';
                  return `${label}: ${formattedVal} (${sharePct}%)`;
                }
                return `${label}: ${formattedVal}`;
              }
            }
          }
        },
        scales: {
          x: {
            stacked: o.stacked || false,
            grid: { display: false },
            ticks: {
              font: { size: 10 },
              maxRotation: 0,
              autoSkip: true,
              maxTicksLimit: 12
            }
          },
          y: {
            stacked: o.stacked || false,
            beginAtZero: o.zero !== false,
            grid: { color: '#f1f5f9' },
            title: unit ? { display: true, text: unit, font: { size: 11, weight: 'bold' } } : undefined,
            ticks: {
              font: { size: 10 },
              callback: (val) => o.fmt ? o.fmt(val as number) : `${val}${unit ? ' ' + unit : ''}`
            }
          }
        }
      }
    });

    setChart(canvas, chart);
  } catch (err) {
    console.warn('drawChart error handled:', err);
  }
}

/**
 * График декомпозиции вкладов (Stacked Area)
 */
export function drawContributionDecompositionChart(
  canvas: HTMLCanvasElement,
  monthlyData: MonthlyContributionPoint[]
): void {
  if (!canvas || !(canvas instanceof HTMLCanvasElement)) return;
  if (!canvas.isConnected || !canvas.ownerDocument || !canvas.parentElement || !canvas.parentNode || !monthlyData || !monthlyData.length) return;
  
  const isVisible = canvas.offsetWidth > 0 || canvas.offsetHeight > 0 || canvas.offsetParent !== null;
  if (!isVisible) return;

  cleanupChart(canvas);

  const labels = traceMap(monthlyData, 'drawContrib monthlyData (labels)', d => d.monthLabel);
  const channels = [
    { key: 'baseline', label: 'Базовые продажи', color: '#3b82f6' },
    { key: 'tvTrp', label: 'ТВ-Реклама (TRP)', color: '#10b981' },
    { key: 'tmaBonus', label: 'Трейд-Маркетинг', color: '#f59e0b' },
    { key: 'crmVisits', label: 'Визиты CRM', color: '#8b5cf6' },
    { key: 'competitorPrice', label: 'Конкуренты / Рынок', color: '#ec4899' }
  ];

  const datasets = traceMap(channels, 'drawContrib channels', ch => ({
    label: ch.label,
    data: traceMap(monthlyData, `drawContrib monthlyData (${ch.key})`, d => (d as any)[ch.key] || 0),
    backgroundColor: ch.color + 'cc',
    borderColor: ch.color,
    borderWidth: 1,
    fill: true,
    pointRadius: 0,
    tension: 0.2
  }));

  try {
    const chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: labels,
        datasets: datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: {
            display: true,
            position: 'bottom',
            labels: { boxWidth: 10, usePointStyle: true, font: { size: 11 } }
          },
          tooltip: {
            backgroundColor: 'rgba(15, 23, 42, 0.9)',
            callbacks: {
              label: (context) => `${context.dataset.label}: ${rub(context.parsed.y as number)}`
            }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10 }, autoSkip: true, maxTicksLimit: 8 } },
          y: {
            stacked: true,
            beginAtZero: true,
            grid: { color: '#f1f5f9' },
            ticks: { font: { size: 10 }, callback: (val) => short(val as number) }
          }
        }
      }
    });
    setChart(canvas, chart);
  } catch (e) {}
}

/**
 * SHAP Summary Bar Chart
 */
export function drawShapSummaryBarChart(
  canvas: HTMLCanvasElement,
  items: Array<{ featureLabel: string; pctImpact: number; meanAbsShap: number }>
): void {
  if (!canvas || !(canvas instanceof HTMLCanvasElement)) return;
  if (!canvas.isConnected || !canvas.ownerDocument || !canvas.parentElement || !canvas.parentNode || !items || !items.length) return;
  
  const isVisible = canvas.offsetWidth > 0 || canvas.offsetHeight > 0 || canvas.offsetParent !== null;
  if (!isVisible) return;
  cleanupChart(canvas);

  try {
    const chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: traceMap(items, 'drawShapSummary items (labels)', it => it.featureLabel),
        datasets: [{
          label: 'Средний вклад (Mean |SHAP|)',
          data: traceMap(items, 'drawShapSummary items (impact)', it => it.pctImpact),
          backgroundColor: traceMap(items, 'drawShapSummary items (colors)', (_, i) => PAL[i % PAL.length] + 'cc'),
          borderRadius: 6,
          borderWidth: 0
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context) => {
                const item = (items || [])[context.dataIndex];
                if (!item) return '';
                return `${item.pctImpact}% (${rub(item.meanAbsShap)})`;
              }
            }
          }
        },
        scales: {
          x: { beginAtZero: true, max: 100, ticks: { callback: (v) => v + '%' } },
          y: { ticks: { font: { size: 11, weight: 'bold' } } }
        }
      }
    });
    setChart(canvas, chart);
  } catch (e) {}
}

/**
 * SHAP Beeswarm Chart
 */
export function drawShapBeeswarmChart(
  canvas: HTMLCanvasElement,
  points: SHAPValuePoint[]
): void {
  if (!canvas || !(canvas instanceof HTMLCanvasElement)) return;
  if (!canvas.isConnected || !canvas.ownerDocument || !canvas.parentElement || !canvas.parentNode || !points || !points.length) return;
  
  const isVisible = canvas.offsetWidth > 0 || canvas.offsetHeight > 0 || canvas.offsetParent !== null;
  if (!isVisible) return;
  cleanupChart(canvas);

  const features = Array.from(new Set(traceMap(points, 'drawShapBeeswarm points (features)', p => p.feature)));
  const datasets = traceMap(features, 'drawShapBeeswarm features', (feat, fIdx) => {
    const featPoints = (points || []).filter(p => p.feature === feat);
    return {
      label: feat,
      data: traceMap(featPoints, `drawShapBeeswarm points (${feat})`, (pt, pIdx) => ({
        x: pt.shapValue,
        y: fIdx + (Math.sin(pIdx * 3.5) * 0.15), // Jitter
        v: pt.featureValueNormalized
      })),
      pointBackgroundColor: (context: any) => {
        const v = context.raw?.v ?? 0.5;
        const red = Math.round(v * 239);
        const blue = Math.round((1 - v) * 239);
        return `rgb(${red}, 70, ${blue})`;
      },
      pointRadius: 4,
      pointHoverRadius: 6
    };
  });

  try {
    const chart = new Chart(canvas, {
      type: 'scatter',
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context: any) => `SHAP: ${short(context.raw.x)}`
            }
          }
        },
        scales: {
          x: {
            title: { display: true, text: '◄ Отрицательное влияние | Положительное влияние ►', font: { size: 10 } },
            grid: { color: '#f1f5f9' }
          },
          y: {
            ticks: {
              callback: (val) => features[val as number] || '',
              font: { size: 11, weight: 'bold' }
            },
            grid: { display: false }
          }
        }
      }
    });
    setChart(canvas, chart);
  } catch (e) {}
}

/**
 * Waterfall Chart (Emulated with Bar)
 */
export function drawWaterfallChart(
  canvas: HTMLCanvasElement,
  items: Array<{ label: string; value: number; type: 'base' | 'plus' | 'minus' | 'total'; color?: string }>
): void {
  if (!canvas || !(canvas instanceof HTMLCanvasElement)) return;
  if (!canvas.isConnected || !canvas.ownerDocument || !canvas.parentElement || !canvas.parentNode || !items || !items.length) return;
  
  const isVisible = canvas.offsetWidth > 0 || canvas.offsetHeight > 0 || canvas.offsetParent !== null;
  if (!isVisible) return;
  cleanupChart(canvas);

  let current = 0;
  const data = traceMap(items, 'drawWaterfall items', it => {
    let start = current;
    let end = current;
    if (it.type === 'base' || it.type === 'total') {
      start = 0;
      end = it.value;
      current = it.value;
    } else if (it.type === 'plus') {
      end = current + it.value;
      current = end;
    } else {
      end = current - Math.abs(it.value);
      current = end;
    }
    return [start, end];
  });

  try {
    const chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: traceMap(items, 'drawWaterfall items (labels)', it => it.label),
        datasets: [{
          data: data as any,
          backgroundColor: traceMap(items, 'drawWaterfall items (colors)', it => it.color || (it.type === 'plus' ? '#10b981cc' : it.type === 'minus' ? '#ef4444cc' : '#2563ebcc')),
          borderRadius: 4,
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context: any) => {
                const item = (items || [])[context.dataIndex];
                if (!item) return '';
                return `Вклад: ${short(item.value)}`;
              }
            }
          }
        },
        scales: {
          y: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { callback: (v) => short(v as number) } },
          x: { grid: { display: false } }
        }
      }
    });
    setChart(canvas, chart);
  } catch (e) {}
}

/**
 * Эластичность спроса
 */
export function drawElasticityChart(
  canvas: HTMLCanvasElement,
  points: Array<{ discountPct: number; salesRevenueRub: number; netProfitRub: number; isOptimal: boolean }>
): void {
  if (!canvas || !(canvas instanceof HTMLCanvasElement)) return;
  if (!canvas.isConnected || !canvas.ownerDocument || !canvas.parentElement || !canvas.parentNode || !points || !points.length) return;
  
  const isVisible = canvas.offsetWidth > 0 || canvas.offsetHeight > 0 || canvas.offsetParent !== null;
  if (!isVisible) return;
  cleanupChart(canvas);

  try {
    const chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: traceMap(points, 'drawElasticity points (labels)', p => p.discountPct + '%'),
        datasets: [
          {
            label: 'Чистая прибыль',
            data: traceMap(points, 'drawElasticity points (profit)', p => p.netProfitRub),
            borderColor: '#10b981',
            backgroundColor: '#10b98133',
            fill: true,
            tension: 0.4,
            pointRadius: traceMap(points, 'drawElasticity points (radii)', p => p.isOptimal ? 8 : 4),
            pointBackgroundColor: traceMap(points, 'drawElasticity points (colors)', p => p.isOptimal ? '#ef4444' : '#10b981')
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context) => `Прибыль: ${rub(context.parsed.y as number)}`
            }
          }
        },
        scales: {
          y: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { callback: (v) => short(v as number) } },
          x: { title: { display: true, text: 'Глубина скидки (%)', font: { size: 10 } } }
        }
      }
    });
    setChart(canvas, chart);
  } catch (e) {}
}

/**
 * STL-Декомпозиция
 */
export function drawSTLDecompositionChart(
  canvas: HTMLCanvasElement,
  stlData: { dates: string[]; actual: number[]; trend: number[]; seasonal: number[]; residual: number[] }
): void {
  if (!canvas || !(canvas instanceof HTMLCanvasElement)) return;
  if (!canvas.isConnected || !canvas.ownerDocument || !canvas.parentElement || !canvas.parentNode || !stlData) return;
  
  const isVisible = canvas.offsetWidth > 0 || canvas.offsetHeight > 0 || canvas.offsetParent !== null;
  if (!isVisible) return;

  cleanupChart(canvas);

  try {
    const chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: stlData.dates || [],
        datasets: [
          { label: 'Факт', data: stlData.actual || [], borderColor: '#2563eb', borderWidth: 1.5, pointRadius: 0, yAxisID: 'y' },
          { label: 'Тренд', data: stlData.trend || [], borderColor: '#16a34a', borderWidth: 2, pointRadius: 0, yAxisID: 'y' },
          { label: 'Сезонность', data: stlData.seasonal || [], borderColor: '#d97706', borderWidth: 1.5, pointRadius: 0, yAxisID: 'yS' },
          { label: 'Остатки', data: stlData.residual || [], borderColor: '#9333ea', borderWidth: 1, pointRadius: 0, yAxisID: 'yS' }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'top', labels: { boxWidth: 10, font: { size: 10 } } }
        },
        scales: {
          x: { ticks: { autoSkip: true, maxTicksLimit: 10 } },
          y: { position: 'left', ticks: { callback: (v) => short(v as number) } },
          yS: { position: 'right', grid: { display: false }, ticks: { font: { size: 9 } } }
        }
      }
    });
    setChart(canvas, chart);
  } catch (e) {}
}

/**
 * Корреляция с заболеваемостью
 */
export function drawIllnessCorrelationChart(
  canvas: HTMLCanvasElement,
  data: Array<{ month: string; arviIndex: number; fluIndex: number; brandSalesNorm: number }>,
  selectedMetric: 'all' | 'arvi' | 'flu' = 'all'
): void {
  if (!canvas || !(canvas instanceof HTMLCanvasElement)) return;
  if (!canvas.isConnected || !canvas.ownerDocument || !canvas.parentElement || !canvas.parentNode || !data || !data.length) return;
  const isVisible = canvas.offsetWidth > 0 || canvas.offsetHeight > 0 || canvas.offsetParent !== null;
  if (!isVisible) return;
  cleanupChart(canvas);

  const datasets: any[] = [
    { label: 'Продажи бренда', data: traceMap(data, 'drawIllness (sales)', d => d.brandSalesNorm), borderColor: '#2563eb', borderWidth: 3, fill: false, tension: 0.3 }
  ];

  if (selectedMetric === 'all' || selectedMetric === 'arvi') {
    datasets.push({ label: 'ОРВИ Индекс', data: traceMap(data, 'drawIllness (arvi)', d => d.arviIndex), borderColor: '#ef4444', borderDash: [5, 5], borderWidth: 1.5, fill: false, tension: 0.3 });
  }
  if (selectedMetric === 'all' || selectedMetric === 'flu') {
    datasets.push({ label: 'Грипп Индекс', data: traceMap(data, 'drawIllness (flu)', d => d.fluIndex), borderColor: '#dc2626', borderDash: [2, 2], borderWidth: 1.5, fill: false, tension: 0.3 });
  }

  try {
    const chart = new Chart(canvas, {
      type: 'line',
      data: { labels: traceMap(data, 'drawIllness (labels)', d => d.month), datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 10 } } },
        scales: {
          y: { min: 0, max: 180, ticks: { callback: (v) => v + '%' } },
          x: { ticks: { autoSkip: true, maxTicksLimit: 8 } }
        }
      }
    });
    setChart(canvas, chart);
  } catch (e) {}
}

/**
 * Residual Analysis Plot (Scatter)
 */
export function drawResidualPlot(
  canvas: HTMLCanvasElement,
  data: Array<{ x: number; y: number }>
): void {
  if (!canvas || !(canvas instanceof HTMLCanvasElement)) return;
  if (!canvas.isConnected || !canvas.ownerDocument || !canvas.parentElement || !canvas.parentNode || !data || !data.length) return;
  const isVisible = canvas.offsetWidth > 0 || canvas.offsetHeight > 0 || canvas.offsetParent !== null;
  if (!isVisible) return;
  cleanupChart(canvas);

  try {
    const chart = new Chart(canvas, {
      type: 'scatter',
      data: {
        datasets: [{
          label: 'Остатки (Residuals)',
          data: data,
          backgroundColor: 'rgba(59, 130, 246, 0.6)',
          pointRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context: any) => {
                const pt = (data || [])[context.dataIndex];
                if (!pt) return '';
                return `Предсказано: ${short(pt.x)} | Ошибка: ${short(pt.y)}`;
              }
            }
          }
        },
        scales: {
          x: { title: { display: true, text: 'Прогноз (Predicted Sales)', font: { size: 10 } } },
          y: { 
            title: { display: true, text: 'Ошибка (Actual - Predicted)', font: { size: 10 } },
            grid: { color: (ctx) => ctx.tick.value === 0 ? '#1e293b' : '#f1f5f9' }
          }
        }
      }
    });
    setChart(canvas, chart);
  } catch (e) {}
}

// Вспомогательные функции для HTML
export const legendHtml = (s: any[]): string => ''; // Chart.js сам рисует легенду
export const kpiHtml = (a: any[]): string =>
  traceMap(a || [], 'kpiHtml input', x => {
    const trend = x[3]; // Optional trend value
    const trendHtml = trend !== undefined ? `
      <div class="trend ${trend > 0 ? 'pos' : trend < 0 ? 'neg' : ''}">
        ${trend > 0 ? '▲' : trend < 0 ? '▼' : '●'} ${Math.abs(trend)}%
      </div>` : '';
    return `
      <div class="card kpi">
        <div class="label">${esc(x[0])}</div>
        <div class="value">${x[1]} ${trendHtml}</div>
        <div class="hint">${esc(x[2] || '')}</div>
      </div>`;
  }).join('');

export const chkHtml = (l: DataCheckItem[]): string =>
  traceMap(l || [], 'chkHtml input', c => '<div class="chk"><span class="badge ' + c.status + '">' + ({ ok: 'OK', warn: 'Внимание', fail: 'Ошибка' }[c.status] || 'Инфо') + '</span><div><b>' + esc(c.title) + '</b><div class="small">' + esc(c.detail) + '</div></div></div>').join('');

export function table(el: HTMLElement | null, heads: string[], rows: any[]): void {
  if (!el) return;
  const renderCellContent = (c: any): string => {
    if (c === null || c === undefined) return '';
    if (typeof c === 'object' && c.html !== undefined) {
      return String(c.html);
    }
    if (typeof c === 'string' && /<\/?(?:span|div|b|strong|i|em|mark|small|p|code|badge|pill|a|label|button)[>\s/]/i.test(c)) {
      return c;
    }
    return esc(c);
  };

  el.innerHTML = '<thead><tr>' + traceMap(heads || [], 'table heads', h => '<th>' + h + '</th>').join('') + '</tr></thead><tbody>' +
    traceMap(rows || [], 'table rows', r => '<tr' + (r.tot ? ' class="tot"' : '') + '>' +
      traceMap((r.tot ? r.cells : r) || [], 'table row cells', (c: any) => '<td' + (c && c.cls ? ' class="' + c.cls + '"' : '') + '>' + renderCellContent(c) + '</td>').join('') +
      '</tr>').join('') + '</tbody>';
}

// Заглушки для специфичных чартов
/**
 * Causal Geo A/B DiD Chart (Fact vs Matched Control vs Counterfactual)
 */
export function drawGeoABChart(
  canvas: HTMLCanvasElement,
  treatSeries: number[],
  scaledControlSeries: number[],
  counterfactualSeries: (number | null)[],
  allMonths: string[],
  splitIndex: number
): void {
  if (!canvas || !(canvas instanceof HTMLCanvasElement)) return;
  if (!canvas.isConnected || !canvas.ownerDocument || !canvas.parentElement || !canvas.parentNode || !treatSeries || !scaledControlSeries) return;
  
  const isVisible = canvas.offsetWidth > 0 || canvas.offsetHeight > 0 || canvas.offsetParent !== null;
  if (!isVisible) return;

  cleanupChart(canvas);

  const datasets: any[] = [
    {
      label: "Тестовый регион (Fact)",
      data: treatSeries,
      borderColor: "#2854e6",
      backgroundColor: "rgba(40, 84, 230, 0.15)",
      borderWidth: 2.5,
      pointRadius: (allMonths || []).length <= 36 ? 3 : 1,
      pointHoverRadius: 6,
      tension: 0.25,
      fill: false
    },
    {
      label: "Синтетический контроль",
      data: scaledControlSeries,
      borderColor: "#0d9488",
      backgroundColor: "rgba(13, 148, 136, 0.15)",
      borderWidth: 2,
      borderDash: [4, 4],
      pointRadius: (allMonths || []).length <= 36 ? 3 : 1,
      tension: 0.25,
      fill: false
    },
    {
      label: "Контрфактуал (Без ТВ / промо)",
      data: counterfactualSeries,
      borderColor: "#f59e0b",
      backgroundColor: "rgba(245, 158, 11, 0.15)",
      borderWidth: 2.5,
      borderDash: [6, 4],
      pointRadius: (allMonths || []).length <= 36 ? 4 : 2,
      pointBackgroundColor: "#f59e0b",
      tension: 0.25,
      fill: false
    }
  ];

  try {
    const chart = new Chart(canvas, {
      type: "line",
      data: {
        labels: allMonths || [],
        datasets: datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: "index",
          intersect: false
        },
        plugins: {
          legend: {
            display: true,
            position: "bottom",
            labels: {
              boxWidth: 12,
              usePointStyle: true,
              pointStyle: "circle",
              font: { size: 11 }
            }
          },
          tooltip: {
            mode: "index",
            intersect: false,
            callbacks: {
              label: (context: any) => {
                const val = context.parsed.y;
                if (val === null || val === undefined) return "";
                return `${context.dataset.label}: ${rub(val)}`;
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: false,
            grid: { color: "#f1f5f9" },
            ticks: { callback: (v: any) => short(v as number) }
          },
          x: {
            grid: {
              color: (ctx: any) => (ctx.index === splitIndex ? "rgba(239, 68, 68, 0.6)" : "#f8fafc"),
              lineWidth: (ctx: any) => (ctx.index === splitIndex ? 2 : 1)
            },
            ticks: { autoSkip: true, maxTicksLimit: 12 }
          }
        }
      }
    });
    setChart(canvas, chart);
  } catch (e) {}
}
/**
 * Сравнение аптечных сетей: Инкрементальная выручка, Бонус и ROAS
 */
export function drawChainsChart(
  canvas: HTMLCanvasElement,
  chains: Array<{ chain: string; roas: number; incrementalRub: number; bonusRub: number }>
): void {
  if (!canvas || !(canvas instanceof HTMLCanvasElement)) return;
  if (!canvas.isConnected || !canvas.ownerDocument || !canvas.parentElement || !canvas.parentNode || !chains || !chains.length) return;
  
  const isVisible = canvas.offsetWidth > 0 || canvas.offsetHeight > 0 || canvas.offsetParent !== null;
  if (!isVisible) return;

  cleanupChart(canvas);

  const topChains = (chains || []).slice(0, 10);
  const labels = traceMap(topChains, 'drawChains labels', c => c.chain || '—');
  const datasets: any[] = [
    {
      type: 'bar',
      label: 'Инкрементальная выручка (₽)',
      data: traceMap(topChains, 'drawChains inc', c => c.incrementalRub),
      backgroundColor: '#2854e6cc',
      borderColor: '#2854e6',
      borderWidth: 1,
      borderRadius: 4,
      yAxisID: 'y'
    },
    {
      type: 'bar',
      label: 'Выплаченный бонус (₽)',
      data: traceMap(topChains, 'drawChains bonus', c => c.bonusRub),
      backgroundColor: '#f59e0bcc',
      borderColor: '#f59e0b',
      borderWidth: 1,
      borderRadius: 4,
      yAxisID: 'y'
    },
    {
      type: 'line',
      label: 'ROAS (₽/₽)',
      data: traceMap(topChains, 'drawChains roas', c => c.roas),
      borderColor: '#10b981',
      backgroundColor: '#10b981',
      borderWidth: 2,
      pointRadius: 4,
      yAxisID: 'y1'
    }
  ];

  try {
    const chart = new Chart(canvas, {
      type: 'bar',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        resizeDelay: 50,
        plugins: {
          legend: { display: true, position: 'bottom', labels: { boxWidth: 10, usePointStyle: true, font: { size: 11 } } },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const val = ctx.parsed.y ?? 0;
                if (ctx.dataset.yAxisID === 'y1') return `ROAS: ${fmt(val, 2)} ₽/₽`;
                return `${ctx.dataset.label}: ${rub(val)}`;
              }
            }
          }
        },
        scales: {
          x: { ticks: { font: { size: 10 }, maxRotation: 20 } },
          y: {
            type: 'linear',
            position: 'left',
            beginAtZero: true,
            ticks: { callback: (v) => short(v as number) }
          },
          y1: {
            type: 'linear',
            position: 'right',
            beginAtZero: true,
            grid: { display: false },
            ticks: { callback: (v) => fmt(v as number, 1) + 'x' }
          }
        }
      }
    });

    setChart(canvas, chart);
  } catch (e) {}
}

/**
 * Сравнение механик ТМА: Чистая прибыль и Uplift %
 */
export function drawMechsChart(
  canvas: HTMLCanvasElement,
  mechs: Array<{ mechanic: string; upliftPct: number; profitRub: number; roas: number }>
): void {
  if (!canvas || !(canvas instanceof HTMLCanvasElement)) return;
  if (!canvas.isConnected || !canvas.ownerDocument || !canvas.parentElement || !canvas.parentNode || !mechs || !mechs.length) return;
  
  const isVisible = canvas.offsetWidth > 0 || canvas.offsetHeight > 0 || canvas.offsetParent !== null;
  if (!isVisible) return;

  cleanupChart(canvas);

  const labels = traceMap(mechs || [], 'drawMechs labels', m => m.mechanic || '—');
  const datasets: any[] = [
    {
      type: 'bar',
      label: 'Чистая прибыль (₽)',
      data: traceMap(mechs || [], 'drawMechs profit', m => m.profitRub),
      backgroundColor: traceMap(mechs || [], 'drawMechs colors', m => m.profitRub >= 0 ? '#10b981cc' : '#ef4444cc'),
      borderColor: traceMap(mechs || [], 'drawMechs borders', m => m.profitRub >= 0 ? '#10b981' : '#ef4444'),
      borderWidth: 1,
      borderRadius: 4,
      yAxisID: 'y'
    },
    {
      type: 'line',
      label: 'Uplift прирост (%)',
      data: traceMap(mechs || [], 'drawMechs uplift', m => (m.upliftPct || 0) * 100),
      borderColor: '#8b5cf6',
      backgroundColor: '#8b5cf6',
      borderWidth: 2,
      pointRadius: 4,
      yAxisID: 'y1'
    }
  ];

  try {
    const chart = new Chart(canvas, {
      type: 'bar',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        resizeDelay: 50,
        plugins: {
          legend: { display: true, position: 'bottom', labels: { boxWidth: 10, usePointStyle: true, font: { size: 11 } } },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const val = ctx.parsed.y ?? 0;
                if (ctx.dataset.yAxisID === 'y1') return `Uplift: ${fmt(val, 1)}%`;
                return `${ctx.dataset.label}: ${rub(val)}`;
              }
            }
          }
        },
        scales: {
          x: { ticks: { font: { size: 10 }, maxRotation: 20 } },
          y: {
            type: 'linear',
            position: 'left',
            ticks: { callback: (v) => short(v as number) }
          },
          y1: {
            type: 'linear',
            position: 'right',
            grid: { display: false },
            ticks: { callback: (v) => fmt(v as number, 0) + '%' }
          }
        }
      }
    });

    setChart(canvas, chart);
  } catch (e) {}
}

/**
 * Сезонная эластичность промо (Lift % и индекс эластичности)
 */
export function drawPromoSeasonalElasticityChart(
  canvas: HTMLCanvasElement,
  items: Array<{
    monthName: string;
    seasonType: 'High' | 'Medium' | 'Low';
    promoDiscountAvg: number;
    baselineSales: number;
    liftPercent: number;
    elasticityIndex: number;
  }>
): void {
  if (!canvas || !(canvas instanceof HTMLCanvasElement)) return;
  if (!canvas.isConnected || !canvas.ownerDocument || !canvas.parentElement || !canvas.parentNode || !items || !items.length) return;
  const isVisible = canvas.offsetWidth > 0 || canvas.offsetHeight > 0 || canvas.offsetParent !== null;
  if (!isVisible) return;
  cleanupChart(canvas);

  const labels = traceMap(items || [], 'drawPromoElasticity labels', it => it.monthName);
  try {
    const chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            type: 'bar',
            label: 'Прирост от промо (Lift %)',
            data: traceMap(items || [], 'drawPromoElasticity lift', it => it.liftPercent),
            backgroundColor: traceMap(items || [], 'drawPromoElasticity colors', it => it.seasonType === 'High' ? '#ef4444cc' : it.seasonType === 'Low' ? '#3b82f6cc' : '#10b981cc'),
            borderColor: traceMap(items || [], 'drawPromoElasticity borders', it => it.seasonType === 'High' ? '#ef4444' : it.seasonType === 'Low' ? '#3b82f6' : '#10b981'),
            borderWidth: 1,
            borderRadius: 4,
            yAxisID: 'y'
          },
          {
            type: 'line',
            label: 'Индекс эластичности',
            data: traceMap(items || [], 'drawPromoElasticity elasticity', it => it.elasticityIndex),
            borderColor: '#f59e0b',
            backgroundColor: '#f59e0b',
            borderWidth: 2,
            pointRadius: 4,
            tension: 0.2,
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        resizeDelay: 50,
        plugins: {
          legend: { display: true, position: 'bottom', labels: { boxWidth: 10, usePointStyle: true, font: { size: 11 } } },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const val = ctx.parsed.y ?? 0;
                if (ctx.dataset.yAxisID === 'y1') return `Эластичность: ${fmt(val, 2)}`;
                const item = (items || [])[ctx.dataIndex];
                if (!item) return '';
                return `Lift: +${fmt(val, 1)}% (${item.seasonType === 'High' ? 'Высокий сезон' : item.seasonType === 'Low' ? 'Низкий' : 'Средний'})`;
              }
            }
          }
        },
        scales: {
          x: { ticks: { font: { size: 10 } } },
          y: {
            type: 'linear',
            position: 'left',
            beginAtZero: true,
            ticks: { callback: (v) => v + '%' }
          },
          y1: {
            type: 'linear',
            position: 'right',
            beginAtZero: true,
            grid: { display: false },
            ticks: { callback: (v) => fmt(v as number, 1) }
          }
        }
      }
    });

    setChart(canvas, chart);
  } catch (e) {}
}

/**
 * Перерисовывает и выравнивает все зарегистрированные графики Chart.js
 * при открытии вкладки или изменении видимости
 */
export function resizeAllCharts(): void {
  try {
    destroyOrphanedCharts();
    
    // Используем массив, чтобы избежать проблем с изменением коллекции во время итерации
    const instances = Object.values(Chart.instances);
    
    for (const chart of instances) {
      if (!chart || (chart as any)._destroyed || !chart.ctx || !chart.platform) continue;
      
      try {
        const cvs = chart.canvas;
        if (!cvs) {
          chart.destroy();
          continue;
        }

        // Проверка: присоединен ли канвас к DOM и имеет ли он владельца документа и окно
        // Chart.js часто падает в getComputedStyle(node.parentNode) если окно или родитель отсутствуют
        const doc = cvs.ownerDocument;
        const win = doc ? doc.defaultView : null;
        const isSane = cvs.isConnected && doc && win && cvs.parentElement && cvs.parentNode;
        
        if (isSane) {
          // Проверяем видимость (чтобы не ресайзить скрытые чарты)
          const isVisible = cvs.offsetWidth > 0 || cvs.offsetHeight > 0 || cvs.offsetParent !== null;
          if (isVisible) {
            chart.resize();
            chart.update('none');
          }
        } else {
          // Если чарт отсоединен или в неадекватном состоянии - уничтожаем
          try {
            chart.destroy();
          } catch (destroyErr) {
            // Если дестрой тоже падает - просто игнорируем
          }
        }
      } catch (e) {
        // Игнорируем ошибки при обработке конкретного чарта
      }
    }
  } catch (globalErr) {
    console.error('Critical error in resizeAllCharts:', globalErr);
  }
}

// Глобальный обработчик ресайза с дебаунсом
let resizeTimeout: any = null;
window.addEventListener('resize', () => {
  if (resizeTimeout) clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    resizeAllCharts();
  }, 150);
});
