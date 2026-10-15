/**
 * Чистый парсер CSV/TSV с автоопределением структуры, разделителей (; / , / \t)
 * и поддержкой точных схем фармацевтических данных:
 * 
 * 1. Продажи аптек:
 *    Год;Месяц (Номер);SKU Бренд;SKU Наименование;federal_district;federal_subject;city;Nanobrick;PhChainName;xMark Продажи Выбытия, уп;xMark Продажи Выбытия, руб
 * 
 * 2. Визиты CRM:
 *    Год;Месяц (Номер);Nanobrick;cc_brand_name;CRM Подтв. визиты, кол-во
 * 
 * 3. ТВ-реклама:
 *    Год;Месяц;Бренд;TRP
 */

export const norm = (s: any): string =>
  String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[\s\-./]+/g, '_')
    .replace(/[^a-zа-я0-9_%]/g, '');

export function num(v: any): number {
  if (typeof v === 'number') return v;
  let s = String(v ?? '').trim().replace(/[\s\u00a0]/g, '').replace(/%$/, '');
  if (s === '' || s === '-' || s.toLowerCase() === 'null') return NaN;
  const c = s.lastIndexOf(','), d = s.lastIndexOf('.');
  if (c >= 0 && d >= 0) {
    s = c > d ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (c >= 0) {
    s = (s.match(/,/g) || []).length > 1 ? s.replace(/,/g, '') : s.replace(',', '.');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

const RU_MONTH_MAP: Record<string, number> = {
  'янв': 1, 'январ': 1, 'января': 1, 'январь': 1, 'jan': 1, 'january': 1,
  'фев': 2, 'феврал': 2, 'февраля': 2, 'февраль': 2, 'feb': 2, 'february': 2,
  'мар': 3, 'март': 3, 'марта': 3, 'mar': 3, 'march': 3,
  'апр': 4, 'апрел': 4, 'апреля': 4, 'апрель': 4, 'apr': 4, 'april': 4,
  'май': 5, 'мая': 5, 'may': 5,
  'июн': 6, 'июня': 6, 'июнь': 6, 'jun': 6, 'june': 6,
  'июл': 7, 'июля': 7, 'июль': 7, 'jul': 7, 'july': 7,
  'авг': 8, 'август': 8, 'августа': 8, 'aug': 8, 'august': 8,
  'сен': 9, 'сентябр': 9, 'сентября': 9, 'сентябрь': 9, 'sep': 9, 'september': 9,
  'окт': 10, 'октябр': 10, 'октября': 10, 'октябрь': 10, 'oct': 10, 'october': 10,
  'ноя': 11, 'ноябр': 11, 'ноября': 11, 'ноябрь': 11, 'nov': 11, 'november': 11,
  'дек': 12, 'декабр': 12, 'декабря': 12, 'декабрь': 12, 'dec': 12, 'december': 12
};

export function parseMonthNameOrNum(v: any): number {
  if (typeof v === 'number' && Number.isFinite(v) && v >= 1 && v <= 12) return Math.round(v);
  const s = String(v ?? '').trim();
  const directNum = parseInt(s, 10);
  if (!isNaN(directNum) && directNum >= 1 && directNum <= 12) return directNum;
  const lc = s.toLowerCase().replace(/[^a-zа-я]/g, '');
  for (const k of Object.keys(RU_MONTH_MAP)) {
    if (lc === k || lc.startsWith(k)) return RU_MONTH_MAP[k];
  }
  return NaN;
}

export function parseMonth(v: any): string {
  const s = String(v ?? '').trim();
  let m = s.match(/(20\d{2})[-/.](\d{1,2})/);
  if (m && +m[2] >= 1 && +m[2] <= 12) return m[1] + '-' + String(+m[2]).padStart(2, '0');
  m = s.match(/(\d{1,2})[-/.](20\d{2})/);
  if (m && +m[1] >= 1 && +m[1] <= 12) return m[2] + '-' + String(+m[1]).padStart(2, '0');
  return '';
}

export function formatYearMonth(yearRaw: any, monthRaw: any): string {
  // Проверяем, не содержит ли monthRaw уже полный год-месяц
  const direct = parseMonth(monthRaw);
  if (direct) return direct;

  let y = num(yearRaw);
  if (!Number.isFinite(y)) {
    const ym = String(yearRaw ?? '').match(/(20\d{2})/);
    if (ym) y = +ym[1];
  }
  if (!Number.isFinite(y) || y < 2000 || y > 2099) return '';

  const m = parseMonthNameOrNum(monthRaw);
  if (!Number.isFinite(m) || m < 1 || m > 12) return '';

  return `${Math.round(y)}-${String(m).padStart(2, '0')}`;
}

export function csvParse(text: string): { heads: string[]; rows: string[][] } {
  text = text.replace(/^\ufeff/, '');
  const lines = text.split(/\r?\n/).filter(x => x.trim().length > 0);
  if (!lines.length) throw Error('CSV файл пуст.');

  const first = lines[0];
  const cntSemi = (first.match(/;/g) || []).length;
  const cntTab = (first.match(/\t/g) || []).length;
  const cntComma = (first.match(/,/g) || []).length;

  // Если в строке заголовка есть хотя бы одна точка с запятой — выбираем точку с запятой (стандарт РФ)
  let sep = ',';
  if (cntSemi > 0 && cntSemi >= cntTab) {
    sep = ';';
  } else if (cntTab > 0 && cntTab >= cntComma) {
    sep = '\t';
  } else {
    sep = cntComma > 0 ? ',' : (cntSemi > 0 ? ';' : ',');
  }

  const rows: string[][] = [];
  let row: string[] = [], v = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (q && text[i + 1] === '"') { v += '"'; i++; } else q = !q;
    } else if (c === sep && !q) {
      row.push(v.trim());
      v = '';
    } else if ((c === '\n' || c === '\r') && !q) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(v.trim());
      if (row.some(x => x !== '')) rows.push(row);
      row = [];
      v = '';
    } else {
      v += c;
    }
  }
  if (v !== '' || row.length) {
    row.push(v.trim());
    if (row.some(x => x !== '')) rows.push(row);
  }
  if (rows.length < 2) throw Error('CSV должен содержать заголовок и как минимум одну строку данных.');
  return { heads: rows[0].map(norm), rows: rows.slice(1) };
}

export interface NanobrickInfo {
  nanobrick: string;
  city: string;
  region: string;
  federalDistrict?: string;
  federalSubject?: string;
}

export class NanobrickRegistry {
  private map = new Map<string, NanobrickInfo>();

  public register(info: NanobrickInfo): void {
    if (!info.nanobrick) return;
    const key = info.nanobrick.trim().toLowerCase();
    const existing = this.map.get(key);
    if (!existing || (!existing.city && info.city)) {
      this.map.set(key, { ...existing, ...info });
    }
  }

  public registerFromSales(rows: any[]): void {
    for (const r of rows) {
      if (r.nanobrick) {
        this.register({
          nanobrick: r.nanobrick,
          city: r.city || '',
          region: r.region || r.federalSubject || '',
          federalDistrict: r.federalDistrict,
          federalSubject: r.federalSubject
        });
      }
    }
  }

  public lookup(nanobrick: string): NanobrickInfo | undefined {
    if (!nanobrick) return undefined;
    return this.map.get(nanobrick.trim().toLowerCase());
  }

  public resolveCityAndRegion(nanobrick: string, fallbackCity = '', fallbackRegion = ''): { city: string; region: string } {
    const info = this.lookup(nanobrick);
    return {
      city: info?.city || fallbackCity || nanobrick || '(не указан)',
      region: info?.region || info?.federalSubject || fallbackRegion || '(не указан)'
    };
  }

  public clear(): void {
    this.map.clear();
  }
}

export const defaultNanobricks = new NanobrickRegistry();

export const ALI: Record<string, string[]> = {
  year: [
    'year', 'год', 'г', 'yr', 'y'
  ],
  monthNum: [
    'month_num', 'месяц_номер', 'номер_месяца', 'month_no', 'month_number', 'm_no', 'm_num', 'месяц_no', 'номермесяца'
  ],
  month: [
    'month', 'period', 'date', 'year_month', 'год_месяц', 'годмесяц', 'период', 'месяц', 'month_name', 'месяц_название'
  ],
  brand: [
    'brand', 'бренд', 'sku_бренд', 'cc_brand_name', 'brand_name', 'торговая_марка', 'тм', 'cc_brand', 'бренд_наименование', 'sku_brand'
  ],
  sku: [
    'sku', 'скю', 'sku_code', 'артикул', 'sku_наименование', 'наименование', 'товар', 'номенклатура', 'product', 'product_name', 'наименование_товара', 'sku_name'
  ],
  federalDistrict: [
    'federal_district', 'федеральный_округ', 'фо', 'district', 'округ', 'fed_district'
  ],
  federalSubject: [
    'federal_subject', 'субъект_рф', 'субъект_федерации', 'область', 'край', 'республика', 'fed_subject'
  ],
  region: [
    'region', 'регион', 'federal_subject', 'субъект_рф', 'субъект_федерации', 'область', 'federal_district', 'федеральный_округ'
  ],
  city: [
    'city', 'город', 'населенный_пункт', 'г'
  ],
  nanobrick: [
    'nanobrick', 'нанобрик', 'brick', 'брик', 'микротерритория', 'nano_brick'
  ],
  chain: [
    'chain', 'pharmacy_chain', 'аптечная_сеть', 'сеть', 'phchainname', 'ph_chain_name', 'аптека', 'сеть_аптек', 'клиент', 'chain_name'
  ],
  units: [
    'units', 'sales_units', 'шт', 'продажи_в_шт', 'продажи_шт', 'количество', 'продажи_в_штуках',
    'xmark_продажи_выбытия_уп', 'выбытия_уп', 'уп', 'упаковки', 'продажи_уп', 'xmark_продажи_уп'
  ],
  salesRub: [
    'sales_rub', 'sales_rub_value', 'revenue', 'sales_value', 'продажи_в_рублях', 'продажи_руб', 'выручка', 'рубли',
    'xmark_продажи_выбытия_руб', 'выбытия_руб', 'продажи_выбытия_руб', 'руб', 'xmark_продажи_руб', 'выбытия_рубли'
  ],
  bonusPct: [
    'bonus_pct', 'bonus_percent', 'investment_pct', 'процент_инвестиций', 'ставка_бонуса', 'бонус_%', 'bonus_rate', 'бонус'
  ],
  mechanic: [
    'mechanic', 'promo_mechanic', 'promo_type', 'механика', 'механика_промо', 'тип_промо'
  ],
  market: [
    'address_market', 'адресный_рынок', 'market', 'рынок', 'segment', 'сегмент'
  ],
  isOwn: [
    'is_own', 'own', 'own_brand', 'свой_бренд', 'наш_бренд', 'наш'
  ],
  trp: [
    'trp', 'grp', 'trp_points', 'тв_trp', 'тв_реклама', 'тв', 'тв_grp'
  ],
  visits: [
    'weighted_visits', 'weighted_visit', 'visits_weighted', 'visits', 'количество_визитов', 'взвешенные_визиты',
    'crm_подтв_визиты_кол_во', 'подтв_визиты_кол_во', 'подтв_визиты', 'визиты', 'crm_визиты', 'кол_во_визитов',
    'crm_подтвержденные_визиты', 'визиты_кол_во'
  ]
};

export const TEXTF = new Set(['region', 'city', 'chain', 'brand', 'sku', 'market', 'mechanic', 'federalDistrict', 'federalSubject', 'nanobrick']);

export class CanonCache {
  private cache: Record<string, Map<string, string>> = {};

  public clear(): void {
    this.cache = {};
  }

  public cn(field: string, v: any): string {
    v = String(v ?? '').trim().replace(/\s+/g, ' ');
    if (!v) return '';
    const m = this.cache[field] || (this.cache[field] = new Map()), lc = v.toLowerCase();
    if (!m.has(lc)) m.set(lc, v);
    return m.get(lc)!;
  }
}

export const defaultCanon = new CanonCache();

function findColIndex(heads: string[], aliasList: string[]): number {
  const normAliases = aliasList.map(norm);
  return heads.findIndex(h => normAliases.includes(h));
}

/**
 * Парсит произвольный CSV текст в структурированные строки с учетом типа источника
 */
export function parseSource(
  text: string,
  type: string,
  canon: CanonCache = defaultCanon,
  nanobricks: NanobrickRegistry = defaultNanobricks
): { rows: any[] } {
  const { heads, rows } = csvParse(text);

  // 1. Поиск колонок даты/времени:
  const yearIdx = findColIndex(heads, ALI.year);
  const monthNumIdx = findColIndex(heads, ALI.monthNum);
  const monthIdx = findColIndex(heads, ALI.month);

  const hasSeparateYearMonth = yearIdx >= 0 && (monthNumIdx >= 0 || (monthIdx >= 0 && monthIdx !== yearIdx));
  const hasUnifiedMonth = monthIdx >= 0;

  if (!hasSeparateYearMonth && !hasUnifiedMonth) {
    throw Error('Не найден столбец даты. Укажите «Год» и «Месяц (Номер)» (или единый «Месяц»).');
  }

  // 2. Поиск колонок предметной области в зависимости от типа источника:
  const colMap: Record<string, number> = {};

  const findRequired = (field: string, displayName: string): number => {
    const idx = findColIndex(heads, ALI[field] || []);
    if (idx < 0) {
      throw Error(`Не найден обязательный столбец «${displayName}» (проверьте заголовки CSV).`);
    }
    return idx;
  };

  const findOptional = (field: string): number => {
    return findColIndex(heads, ALI[field] || []);
  };

  if (type === 'sales') {
    colMap.brand = findRequired('brand', 'SKU Бренд');
    colMap.sku = findRequired('sku', 'SKU Наименование');
    colMap.city = findRequired('city', 'city (город)');
    colMap.chain = findRequired('chain', 'PhChainName (аптечная сеть)');
    colMap.units = findRequired('units', 'xMark Продажи Выбытия, уп');
    colMap.salesRub = findRequired('salesRub', 'xMark Продажи Выбытия, руб');

    colMap.federalDistrict = findOptional('federalDistrict');
    colMap.federalSubject = findOptional('federalSubject');
    colMap.region = findOptional('region');
    colMap.nanobrick = findOptional('nanobrick');
  } else if (type === 'visits') {
    colMap.brand = findRequired('brand', 'cc_brand_name (бренд)');
    colMap.visits = findRequired('visits', 'CRM Подтв. визиты, кол-во');

    colMap.nanobrick = findOptional('nanobrick');
    colMap.city = findOptional('city');
    colMap.region = findOptional('region');
  } else if (type === 'tv') {
    colMap.brand = findRequired('brand', 'Бренд');
    colMap.trp = findRequired('trp', 'TRP');
  } else if (type === 'promo') {
    colMap.chain = findRequired('chain', 'Аптечная сеть');
    colMap.brand = findRequired('brand', 'Бренд');
    colMap.sku = findRequired('sku', 'SKU');
    colMap.bonusPct = findRequired('bonusPct', 'Бонус / ставка');

    colMap.mechanic = findOptional('mechanic');
    colMap.region = findOptional('region');
    colMap.city = findOptional('city');
    colMap.nanobrick = findOptional('nanobrick');
  } else if (type === 'market') {
    colMap.market = findRequired('market', 'Адресный рынок');
    colMap.brand = findRequired('brand', 'Бренд');
    colMap.sku = findOptional('sku'); // Опционально: данные могут быть как по SKU, так и укрупненно по брендам

    const uIdx = findOptional('units');
    const sIdx = findOptional('salesRub');
    if (uIdx < 0 && sIdx < 0) {
      throw Error('Не найдены столбцы продаж рынка («Продажи, руб» или «Продажи, шт»).');
    }
    colMap.units = uIdx;
    colMap.salesRub = sIdx;

    colMap.region = findOptional('region');
    colMap.city = findOptional('city');
    colMap.nanobrick = findOptional('nanobrick');
    colMap.isOwn = findOptional('isOwn');
  }

  const out: any[] = [];

  for (let rIdx = 0; rIdx < rows.length; rIdx++) {
    const r = rows[rIdx];
    const o: any = {};

    // 1. Извлечение месяца
    let ym = '';
    let parsedYear: number | undefined;
    let parsedMonthNum: number | undefined;

    if (hasSeparateYearMonth) {
      const rawY = r[yearIdx];
      const rawM = monthNumIdx >= 0 ? r[monthNumIdx] : r[monthIdx];
      ym = formatYearMonth(rawY, rawM);
      const yVal = num(rawY);
      const mVal = parseMonthNameOrNum(rawM);
      if (Number.isFinite(yVal)) parsedYear = Math.round(yVal);
      if (Number.isFinite(mVal)) parsedMonthNum = mVal;
    } else if (hasUnifiedMonth) {
      const rawM = r[monthIdx];
      ym = parseMonth(rawM);
      if (ym) {
        const parts = ym.split('-');
        parsedYear = +parts[0];
        parsedMonthNum = +parts[1];
      }
    }

    if (!ym) {
      // Пропуск строк без корректной даты
      continue;
    }

    o.month = ym;
    if (parsedYear !== undefined) o.year = parsedYear;
    if (parsedMonthNum !== undefined) o.monthNum = parsedMonthNum;

    // 2. Извлечение полей источника
    let badRow = false;

    if (type === 'sales') {
      o.brand = canon.cn('brand', r[colMap.brand]);
      o.sku = canon.cn('sku', r[colMap.sku]);
      o.city = canon.cn('city', r[colMap.city]);
      o.chain = canon.cn('chain', r[colMap.chain]);

      const units = num(r[colMap.units]);
      const salesRub = num(r[colMap.salesRub]);
      if (!Number.isFinite(units) || !Number.isFinite(salesRub)) {
        continue;
      }
      o.units = units;
      o.salesRub = salesRub;

      o.federalDistrict = colMap.federalDistrict >= 0 ? canon.cn('federalDistrict', r[colMap.federalDistrict]) : '';
      o.federalSubject = colMap.federalSubject >= 0 ? canon.cn('federalSubject', r[colMap.federalSubject]) : '';
      o.nanobrick = colMap.nanobrick >= 0 ? canon.cn('nanobrick', r[colMap.nanobrick]) : '';

      // Регион: если нет явного столбца region, берем federalSubject или federalDistrict или city
      if (colMap.region >= 0 && r[colMap.region]) {
        o.region = canon.cn('region', r[colMap.region]);
      } else {
        o.region = o.federalSubject || o.federalDistrict || o.city || '(не указан)';
      }

      // Регистрируем нанобрик в справочнике
      if (o.nanobrick) {
        nanobricks.register({
          nanobrick: o.nanobrick,
          city: o.city,
          region: o.region,
          federalDistrict: o.federalDistrict,
          federalSubject: o.federalSubject
        });
      }
    } else if (type === 'visits') {
      o.brand = canon.cn('brand', r[colMap.brand]);
      const vis = num(r[colMap.visits]);
      if (!Number.isFinite(vis)) {
        continue;
      }
      o.visits = Math.max(0, vis);

      o.nanobrick = colMap.nanobrick >= 0 ? canon.cn('nanobrick', r[colMap.nanobrick]) : '';
      const explicitCity = colMap.city >= 0 ? canon.cn('city', r[colMap.city]) : '';
      const explicitReg = colMap.region >= 0 ? canon.cn('region', r[colMap.region]) : '';

      // Разрешение города и региона через nanobrick если они не указаны в файле визитов
      const geo = nanobricks.resolveCityAndRegion(o.nanobrick, explicitCity, explicitReg);
      o.city = geo.city;
      o.region = geo.region;
    } else if (type === 'tv') {
      o.brand = canon.cn('brand', r[colMap.brand]);
      const trp = num(r[colMap.trp]);
      if (!Number.isFinite(trp)) {
        continue;
      }
      o.trp = Math.max(0, trp);
    } else if (type === 'promo') {
      o.chain = canon.cn('chain', r[colMap.chain]);
      o.brand = canon.cn('brand', r[colMap.brand]);
      o.sku = canon.cn('sku', r[colMap.sku]);
      const bp = num(r[colMap.bonusPct]);
      if (!Number.isFinite(bp)) continue;
      o.bonusPct = bp;
      o.mechanic = colMap.mechanic >= 0 ? canon.cn('mechanic', r[colMap.mechanic]) : 'Не указана';
      o.region = colMap.region >= 0 ? canon.cn('region', r[colMap.region]) : '';
      o.nanobrick = colMap.nanobrick >= 0 ? canon.cn('nanobrick', r[colMap.nanobrick]) : '';
      // Город в ТМА больше не используется (ТМА на всю сеть)
      o.city = '';
    } else if (type === 'market') {
      o.market = canon.cn('market', r[colMap.market]);
      o.brand = canon.cn('brand', r[colMap.brand]);
      o.sku = colMap.sku >= 0 && r[colMap.sku] ? canon.cn('sku', r[colMap.sku]) : (o.brand || '(Все SKU)');
      const u = colMap.units >= 0 ? num(r[colMap.units]) : NaN;
      const sr = colMap.salesRub >= 0 ? num(r[colMap.salesRub]) : NaN;
      if (!Number.isFinite(u) && !Number.isFinite(sr)) continue;
      o.units = Number.isFinite(u) ? u : 0;
      o.salesRub = Number.isFinite(sr) ? sr : 0;

      // В рыночных данных регион это federal_subject из продаж
      const fedSub = colMap.federalSubject >= 0 ? canon.cn('federalSubject', r[colMap.federalSubject]) : '';
      const reg = colMap.region >= 0 ? canon.cn('region', r[colMap.region]) : '';
      o.region = fedSub || reg || 'РФ';

      o.city = colMap.city >= 0 && r[colMap.city] ? canon.cn('city', r[colMap.city]) : '';
      o.nanobrick = colMap.nanobrick >= 0 && r[colMap.nanobrick] ? canon.cn('nanobrick', r[colMap.nanobrick]) : '';
      if (colMap.isOwn >= 0) {
        o.isOwn = /^(1|да|yes|true|own|свой|наш)$/i.test(String(r[colMap.isOwn]).trim());
      }
    }

    if (!badRow) {
      out.push(o);
    }
  }

  return { rows: out };
}

export async function readFile(f: File): Promise<string> {
  const buf = await f.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch (e) {
    return new TextDecoder('windows-1251').decode(buf);
  }
}

/**
 * Генерирует типовой шаблон CSV с точными заголовками для каждого источника данных
 */
export function generateTemplateCSV(type: 'sales' | 'visits' | 'tv' | 'promo' | 'market'): string {
  if (type === 'sales') {
    return [
      'Год;Месяц (Номер);SKU Бренд;SKU Наименование;federal_district;federal_subject;city;Nanobrick;PhChainName;xMark Продажи Выбытия, уп;xMark Продажи Выбытия, руб',
      '2024;1;CardioPlus;CardioPlus 100мг №30;ЦФО;г. Москва;Москва;BRK-MOW-01;Ригла;125;145000',
      '2024;1;CardioPlus;CardioPlus 100мг №30;ЦФО;г. Москва;Москва;BRK-MOW-02;Аптека 36.6;98;112000',
      '2024;1;GastroCare;GastroCare 20мг №14;СЗФО;г. Санкт-Петербург;Санкт-Петербург;BRK-SPB-01;Планета Здоровья;84;95000',
      '2024;2;CardioPlus;CardioPlus 100мг №30;ЦФО;г. Москва;Москва;BRK-MOW-01;Ригла;132;153000'
    ].join('\r\n');
  }
  if (type === 'visits') {
    return [
      'Год;Месяц (Номер);Nanobrick;cc_brand_name;CRM Подтв. визиты, кол-во',
      '2024;1;BRK-MOW-01;CardioPlus;18',
      '2024;1;BRK-MOW-02;CardioPlus;14',
      '2024;1;BRK-SPB-01;GastroCare;12',
      '2024;2;BRK-MOW-01;CardioPlus;22'
    ].join('\r\n');
  }
  if (type === 'tv') {
    return [
      'Год;Месяц;Бренд;TRP',
      '2024;1;CardioPlus;140',
      '2024;1;GastroCare;95',
      '2024;1;VitaMax;60',
      '2024;2;CardioPlus;160'
    ].join('\r\n');
  }
  if (type === 'promo') {
    return [
      'Год;Месяц (Номер);Аптечная сеть;Бренд;SKU;Бонус %;Механика;Регион',
      '2024;1;Ригла;CardioPlus;CardioPlus 100мг №30;4.5;Бонус за выкуп;г. Москва',
      '2024;1;Аптека 36.6;CardioPlus;CardioPlus 100мг №30;3.0;Бонус за выкладку;г. Москва'
    ].join('\r\n');
  }
  return [
    'Год;Месяц (Номер);Адресный рынок;federal_subject;Бренд;SKU;Продажи, шт;Продажи, руб;Наш бренд',
    '2024;1;Кардиология;г. Москва;CardioPlus;CardioPlus 100мг №30;125;145000;1',
    '2024;1;Кардиология;г. Москва;CardioMed;CardioMed 100мг №30;310;340000;0'
  ].join('\r\n');
}
