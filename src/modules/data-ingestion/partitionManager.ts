/**
 * Управление партициями данных: пофайловая и погодовая загрузка, слияние и журнал
 */

import { PharmaDataStore } from '../../core/store';
import { PartitionLogEntry } from '../../types/pharma';
import { SEP, uniq } from '../../utils/math';
import { parseSource, readFile, defaultNanobricks } from './csvParser';
import { generateDemoDataset } from './demoGenerator';

export const TYPE_NAMES: Record<string, string> = {
  sales: 'Продажи аптек',
  promo: 'Промо / бонусы',
  tv: 'ТВ-реклама',
  visits: 'Визиты медпредов (CRM)',
  market: 'Рыночные данные'
};

export const STORE_KEYS: Record<string, 'sales' | 'promos' | 'tv' | 'visits' | 'market'> = {
  sales: 'sales',
  promo: 'promos',
  tv: 'tv',
  visits: 'visits',
  market: 'market'
};

export function getRowKey(r: any, type: string): string {
  if (type === 'sales') return [r.month, r.region, r.city, r.chain, r.brand, r.sku, r.nanobrick || ''].join(SEP);
  if (type === 'promo') return [r.month, r.chain, r.brand, r.sku, r.region || '', r.city || '', r.nanobrick || ''].join(SEP);
  if (type === 'tv') return [r.month, r.brand].join(SEP);
  if (type === 'visits') return [r.month, r.brand, r.nanobrick || (r.city || '')].join(SEP);
  if (type === 'market') return [r.month, r.market, r.region || '', r.city || '', r.brand, r.sku || ''].join(SEP);
  return JSON.stringify(r);
}

export async function processSourceFiles(
  store: PharmaDataStore,
  type: string,
  fileList: FileList | File[]
): Promise<{ success: boolean; totalNew: number; totalUpdated: number; message: string }> {
  const storeKey = STORE_KEYS[type];
  const files = Array.from(fileList);
  if (!files.length) return { success: false, totalNew: 0, totalUpdated: 0, message: 'Файлы не выбраны' };

  let totalNew = 0, totalUpdated = 0;
  const state = store.getState();
  const uploadMode = state.uploadMode;

  for (let fIdx = 0; fIdx < files.length; fIdx++) {
    const f = files[fIdx];
    try {
      const text = await readFile(f);
      const parsed = parseSource(text, type);

      store.update(draft => {
        // Регистрация нанобриков и перекрестная привязка городов для визитов
        if (type === 'sales') {
          defaultNanobricks.registerFromSales(parsed.rows);
          // Дообогащаем ранее загруженные визиты по свежему справочнику нанобриков
          draft.raw.visits.forEach(v => {
            if ((!v.city || v.city === '(не указан)') && v.nanobrick) {
              const geo = defaultNanobricks.resolveCityAndRegion(v.nanobrick, v.city, v.region);
              v.city = geo.city;
              v.region = geo.region;
            }
          });
        } else if (type === 'visits') {
          // Если справочник уже наполнен из продаж, гарантируем актуализацию гео-полей
          parsed.rows.forEach(v => {
            if ((!v.city || v.city === '(не указан)') && v.nanobrick) {
              const geo = defaultNanobricks.resolveCityAndRegion(v.nanobrick, v.city, v.region);
              v.city = geo.city;
              v.region = geo.region;
            }
          });
        }

        if (uploadMode === 'overwrite' && fIdx === 0) {
          (draft.raw as any)[storeKey] = parsed.rows;
          const monthsCovered = uniq(parsed.rows.map((r: any) => r.month)).sort();
          draft.partitionLogs.push({
            id: String(Date.now()) + Math.random(),
            type,
            typeName: TYPE_NAMES[type] || type,
            fileName: f.name,
            months: monthsCovered,
            newCount: parsed.rows.length,
            updatedCount: 0,
            totalCount: parsed.rows.length,
            time: new Date().toLocaleTimeString()
          });
          totalNew += parsed.rows.length;
        } else {
          // Append / Upsert mode
          const existingMap = new Map<string, any>();
          ((draft.raw as any)[storeKey] || []).forEach((r: any) => existingMap.set(getRowKey(r, type), r));

          let fNew = 0, fUpd = 0;
          parsed.rows.forEach((r: any) => {
            const k = getRowKey(r, type);
            if (existingMap.has(k)) {
              existingMap.set(k, { ...existingMap.get(k), ...r });
              fUpd++;
            } else {
              existingMap.set(k, r);
              fNew++;
            }
          });

          (draft.raw as any)[storeKey] = Array.from(existingMap.values());
          const monthsCovered = uniq(parsed.rows.map((r: any) => r.month)).sort();
          draft.partitionLogs.push({
            id: String(Date.now()) + Math.random(),
            type,
            typeName: TYPE_NAMES[type] || type,
            fileName: f.name,
            months: monthsCovered,
            newCount: fNew,
            updatedCount: fUpd,
            totalCount: (draft.raw as any)[storeKey].length,
            time: new Date().toLocaleTimeString()
          });
          totalNew += fNew;
          totalUpdated += fUpd;
        }
        (draft.imported as any)[type] = true;
      });
    } catch (err: any) {
      return { success: false, totalNew, totalUpdated, message: `Ошибка импорта ${f.name}: ${err.message}` };
    }
  }

  const finalCount = (store.getState().raw as any)[storeKey]?.length || 0;
  return {
    success: true,
    totalNew,
    totalUpdated,
    message: `Успешно обработано (${files.length} файл(ов)): добавлено ${totalNew}, обновлено ${totalUpdated}. Всего в памяти: ${finalCount} записей.`
  };
}

export function loadYearlyDemoPartitions(store: PharmaDataStore): void {
  const full = generateDemoDataset();
  const s2023 = full.s.filter(r => r.month.startsWith('2023'));
  const s2024 = full.s.filter(r => r.month.startsWith('2024'));
  const s2025 = full.s.filter(r => r.month.startsWith('2025'));

  store.update(draft => {
    draft.partitionLogs.length = 0;

    // Загрузка 2023
    draft.raw.sales = [...s2023];
    draft.partitionLogs.push({
      id: 'p-2023',
      type: 'sales',
      typeName: 'Продажи аптек',
      fileName: 'sales_2023.csv',
      months: uniq(s2023.map(r => r.month)).sort(),
      newCount: s2023.length,
      updatedCount: 0,
      totalCount: draft.raw.sales.length,
      time: new Date().toLocaleTimeString()
    });

    // Загрузка 2024 (Append)
    draft.raw.sales = draft.raw.sales.concat(s2024);
    draft.partitionLogs.push({
      id: 'p-2024',
      type: 'sales',
      typeName: 'Продажи аптек',
      fileName: 'sales_2024.csv',
      months: uniq(s2024.map(r => r.month)).sort(),
      newCount: s2024.length,
      updatedCount: 0,
      totalCount: draft.raw.sales.length,
      time: new Date().toLocaleTimeString()
    });

    // Загрузка 2025 (Append)
    draft.raw.sales = draft.raw.sales.concat(s2025);
    draft.partitionLogs.push({
      id: 'p-2025',
      type: 'sales',
      typeName: 'Продажи аптек',
      fileName: 'sales_2025.csv',
      months: uniq(s2025.map(r => r.month)).sort(),
      newCount: s2025.length,
      updatedCount: 0,
      totalCount: draft.raw.sales.length,
      time: new Date().toLocaleTimeString()
    });

    draft.raw.promos = full.p;
    draft.raw.tv = full.t;
    draft.raw.visits = full.v;
    draft.raw.market = full.mk;
  });
}
