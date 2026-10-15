/**
 * Модуль экспорта сводного аналитического отчета в формате Excel (.xlsx)
 */

import * as XLSX from 'xlsx';
import { AutoMLOverallSummary } from '../modules/mmm-engine/automlEngine';

export function exportFullPharmaReportToExcel(
  summary: AutoMLOverallSummary,
  fileName: string = 'PharmaMix_Lab_Executive_Report.xlsx'
): void {
  const wb = XLSX.utils.book_new();

  // 1. Вкладка "Сравнение брендов"
  const brandData = Object.values(summary.brandResults).map(b => ({
    'Бренд': b.brand,
    'Выручка всего (₽)': b.totalSalesRub,
    'Объем (шт)': b.totalUnits,
    'Доля Baseline (%)': b.baselineSharePct,
    'Инкрементальные продажи (₽)': b.incrementalSalesRub,
    'Лучшая модель': b.bestModelName,
    'Ошибка MAPE (%)': b.bestMape,
    'Точность R²': b.bestR2,
    'Итоговый ROAS': b.roas,
    'Период полураспада Adstock (мес)': b.optimalAdstockHalfLifeMonths,
    'Экономическая валидность': b.economicValid ? 'Подтверждена' : 'Проверить'
  }));
  const wsBrands = XLSX.utils.json_to_sheet(brandData);
  XLSX.utils.book_append_sheet(wb, wsBrands, 'Сравнение брендов');

  // 2. Вкладка "ТМА Механики"
  const mechData = summary.mechanicStats.map(m => ({
    'Механика ТМА': m.mechanic,
    'Средняя ставка (%)': m.avgBonusPct,
    'Инкрементальный объем (шт)': m.incrementalUnits,
    'Инкрементальная выручка (₽)': m.incrementalRevenueRub,
    'Выплаченный бонус (₽)': m.bonusRub,
    'Чистая прибыль (₽)': m.profitRub,
    'ROAS': m.roas,
    'ROI (%)': m.roiPct,
    'Прирост (Uplift %)': m.upliftPct
  }));
  const wsMech = XLSX.utils.json_to_sheet(mechData);
  XLSX.utils.book_append_sheet(wb, wsMech, 'ТМА Механики');

  // 3. Вкладка "ТМА Аптечные сети"
  const chainData = summary.chainStats.map(c => ({
    'Аптечная сеть': c.chain,
    'Доля в промо-объеме (%)': c.shareOfPromoVolumePct,
    'Инкрементальная выручка (₽)': c.incrementalRevenueRub,
    'Выплаченный бонус (₽)': c.bonusRub,
    'Чистая прибыль (₽)': c.profitRub,
    'ROAS': c.roas,
    'ROI (%)': c.roiPct
  }));
  const wsChains = XLSX.utils.json_to_sheet(chainData);
  XLSX.utils.book_append_sheet(wb, wsChains, 'ТМА Аптечные сети');

  // 4. Вкладка "Эластичность и Оптимальная Скидка"
  const elasticityRows: any[] = [];
  Object.entries(summary.elasticityByBrand).forEach(([bName, el]) => {
    el.curve.forEach(pt => {
      elasticityRows.push({
        'Бренд': bName,
        'Ставка бонуса / Скидка (%)': pt.discountPct,
        'Продажи (шт)': pt.salesVolumeUnits,
        'Выручка (₽)': pt.salesRevenueRub,
        'Инкрементальная выручка (₽)': pt.incrementalRevenueRub,
        'Чистая маржинальная прибыль (₽)': pt.netProfitRub,
        'Коэф. эластичности': pt.elasticityCoef,
        'Оптимум': pt.isOptimal ? '★ ОПТИМАЛЬНАЯ СТАВКА' : ''
      });
    });
  });
  const wsElasticity = XLSX.utils.json_to_sheet(elasticityRows);
  XLSX.utils.book_append_sheet(wb, wsElasticity, 'Эластичность спроса');

  // Скачиваем созданный файл
  XLSX.writeFile(wb, fileName);
}
