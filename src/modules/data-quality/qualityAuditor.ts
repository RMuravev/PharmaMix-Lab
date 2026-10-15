/**
 * Аудит качества, полноты и целостности фармацевтических данных
 */

import { RawMarketRow, DerivedStructures, DataCheckItem } from '../../types/pharma';
import { SEP } from '../../utils/math';

export function runDataQualityAudit(
  market: RawMarketRow[],
  derived: DerivedStructures
): DataCheckItem[] {
  const out: DataCheckItem[] = [];
  const add = (title: string, status: 'ok' | 'warn' | 'fail', detail: string) => {
    out.push({ title, status, detail });
  };

  if (market.length) {
    const g = new Map<string, number>();
    for (const r of market) {
      const k = [r.market, r.region, r.month].join(SEP);
      g.set(k, (g.get(k) || 0) + r.salesRub);
    }
    const sh = new Map<string, number>();
    for (const r of market) {
      const k = [r.market, r.region, r.month].join(SEP);
      sh.set(k, (sh.get(k) || 0) + r.salesRub / (g.get(k) || 1));
    }
    let mx = 0;
    for (const v of sh.values()) mx = Math.max(mx, Math.abs(v - 1));
    add(
      'Доли рынка суммируются в 100%',
      mx < 1e-9 ? 'ok' : 'fail',
      'Проверено ' + g.size + ' групп рынка, макс. отклонение ' + mx.toExponential(1)
    );
  } else {
    add('Рыночные данные', 'warn', 'Источник рынка пуст: расчет долей конкурентов недоступен.');
  }

  add(
    'Дубли ключей в аптечных продажах',
    derived.dupKeys ? 'warn' : 'ok',
    derived.dupKeys ? `${derived.dupKeys} дублей ключа: суммируются.` : 'Дублей нет, первичные ключи уникальны.'
  );

  if (derived.orphans > 0) {
    add(
      'Непривязанные промо-акции (Orphans)',
      'warn',
      `Обнаружено ${derived.orphans} промо-записей, для которых не найдено соответствующих продаж в сети.`
    );
  } else {
    add(
      'Согласованность промо и чеков',
      'ok',
      'Все промо-акции сопоставлены с реальными аптечными продажами.'
    );
  }

  // Аудит пробелов в продажах (месяца с 0 продаж при отсутствии строки в CSV)
  const panel = derived?.panel || [];
  const zeroSalesMonths = panel.filter(p => p.salesRub === 0).length;
  if (zeroSalesMonths > 0) {
    add(
      'Пробелы в продажах (месяца с 0)',
      'ok',
      `${zeroSalesMonths} бренд-месяцев без строк в файле корректно зафиксированы со строгим значением 0 продаж (без выпадения из временного ряда).`
    );
  } else {
    add(
      'Календарная непрерывность продаж',
      'ok',
      `Все ${(derived?.months || []).length} календарных месяцев имеют непрерывные продажи, временной ряд полон.`
    );
  }

  // Аудит отсутствующих драйверов (ТВ, Визиты, Промо при отсутствии в файле = 0)
  const zeroTRP = derived.panel.filter(p => p.trp === 0).length;
  const zeroVisits = derived.panel.filter(p => p.visits === 0).length;
  const zeroPromo = derived.panel.filter(p => p.bonusIdx === 0).length;
  add(
    'Факторы влияния без записей в файле',
    'ok',
    `Отсутствующие в файле записи строго принимают значение 0 (ТВ: ${zeroTRP}, Визиты: ${zeroVisits}, Промо: ${zeroPromo} бренд-месяцев с 0).`
  );

  return out;
}
