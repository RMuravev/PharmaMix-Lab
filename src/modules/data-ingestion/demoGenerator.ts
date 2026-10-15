/**
 * Генератор синтетических данных для фармацевтического анализа и квази-экспериментов
 * Полностью соответствует целевым спецификациям:
 * - Продажи: Год;Месяц (Номер);SKU Бренд;SKU Наименование;federal_district;federal_subject;city;Nanobrick;PhChainName;xMark Продажи Выбытия, уп;xMark Продажи Выбытия, руб
 * - Визиты: Год;Месяц (Номер);Nanobrick;cc_brand_name;CRM Подтв. визиты, кол-во
 * - ТВ: Год;Месяц;Бренд;TRP
 */

import { RawSalesRow, RawPromoRow, RawTVRow, RawVisitRow, RawMarketRow } from '../../types/pharma';
import { defaultNanobricks } from './csvParser';

export interface DemoDataset {
  s: RawSalesRow[];
  p: RawPromoRow[];
  t: RawTVRow[];
  v: RawVisitRow[];
  mk: RawMarketRow[];
}

export function generateDemoDataset(): DemoDataset {
  const s: RawSalesRow[] = [];
  const p: RawPromoRow[] = [];
  const t: RawTVRow[] = [];
  const v: RawVisitRow[] = [];
  const mk: RawMarketRow[] = [];

  const brands = ['CardioPlus', 'GastroCare', 'VitaMax'];
  const markets = ['Кардиология', 'Гастроэнтерология', 'Витамины и БАД'];
  const chains = ['Ригла', 'Аптека 36.6', 'Планета Здоровья'];

  // 8 регионов с федеральными округами, субъектами и нанобриками
  const regions = [
    { reg: 'Москва', city: 'Москва', fedDist: 'ЦФО', fedSub: 'г. Москва', nanobrick: 'BRK-MOW-01', isTreat: true, mult: 1.05 },
    { reg: 'Северо-Запад', city: 'Санкт-Петербург', fedDist: 'СЗФО', fedSub: 'г. Санкт-Петербург', nanobrick: 'BRK-SPB-01', isTreat: true, mult: 0.90 },
    { reg: 'Поволжье', city: 'Казань', fedDist: 'ПФО', fedSub: 'Республика Татарстан', nanobrick: 'BRK-KZN-01', isTreat: true, mult: 0.75 },
    { reg: 'Урал', city: 'Екатеринбург', fedDist: 'УФО', fedSub: 'Свердловская область', nanobrick: 'BRK-EKB-01', isTreat: true, mult: 0.80 },
    // Контрольные регионы (чистая органика без визитов медпредов и/или без трейд-маркетинга):
    { reg: 'Сибирь', city: 'Новосибирск', fedDist: 'СФО', fedSub: 'Новосибирская область', nanobrick: 'BRK-NSK-01', isTreat: false, mult: 0.78 },
    { reg: 'Юг', city: 'Ростов-на-Дону', fedDist: 'ЮФО', fedSub: 'Ростовская область', nanobrick: 'BRK-ROV-01', isTreat: false, mult: 0.72 },
    { reg: 'Черноземье', city: 'Воронеж', fedDist: 'ЦФО', fedSub: 'Воронежская область', nanobrick: 'BRK-VRN-01', isTreat: false, mult: 0.58 },
    { reg: 'Дальний Восток', city: 'Владивосток', fedDist: 'ДФО', fedSub: 'Приморский край', nanobrick: 'BRK-VVO-01', isTreat: false, mult: 0.54 }
  ];

  // Регистрация нанобриков в реестре
  regions.forEach(r => {
    defaultNanobricks.register({
      nanobrick: r.nanobrick,
      city: r.city,
      region: r.reg,
      federalDistrict: r.fedDist,
      federalSubject: r.fedSub
    });
  });

  const mech = ['Бонус за выкуп', 'Бонус за выкладку', 'Бонус за рост продаж', 'Бонус за выполнение плана'];
  const base0 = [0.03, 0.02, 0, 0];
  const kk = [0.018, 0.03, 0.012, 0.002];
  const rate0 = [3, 2, 4, 3.5];
  const comps = [
    ['CardioMed', 'HeartGuard', 'Corvital'],
    ['GastroLine', 'DigestPro', 'ProBiotix'],
    ['VitaPrime', 'NutriLife', 'MultiVit']
  ];
  const cf = [0.9, 1.15, 0.55];
  const cg = [0.012, -0.008, 0.002];
  const cp = [0.95, 1.1, 0.8];
  const prices = [430, 560, 690];

  for (let i = 0; i < 30; i++) {
    const dt = new Date(2023, i, 1);
    const yr = dt.getFullYear();
    const moNum = dt.getMonth() + 1;
    const m = yr + '-' + String(moNum).padStart(2, '0');
    const season = 1 + 0.13 * Math.sin((dt.getMonth() / 12) * Math.PI * 2 - 0.7);
    const trend = 1 + i * 0.004;

    for (let b = 0; b < 3; b++) {
      t.push({
        month: m,
        year: yr,
        monthNum: moNum,
        brand: brands[b],
        trp: (i % 4 === 0 ? 80 : 25) + ((i * 13 + b * 21) % 90)
      });

      for (let r = 0; r < regions.length; r++) {
        const regInfo = regions[r];
        // Кампания стартует с месяца 14 (2024-03)
        const isCampaign = i >= 14;

        // Визиты медпредставителей (CRM):
        if (regInfo.isTreat) {
          const vBase = 80 + ((i * 17 + b * 29 + r * 13) % 110);
          const vBoost = isCampaign ? 1.35 : 1.0;
          v.push({
            month: m,
            year: yr,
            monthNum: moNum,
            nanobrick: regInfo.nanobrick,
            region: regInfo.reg,
            city: regInfo.city,
            brand: brands[b],
            visits: Math.round(vBase * vBoost)
          });
        } else {
          // В контрольных регионах визиты ОТСУТСТВУЮТ (0 визитов)
          v.push({
            month: m,
            year: yr,
            monthNum: moNum,
            nanobrick: regInfo.nanobrick,
            region: regInfo.reg,
            city: regInfo.city,
            brand: brands[b],
            visits: 0
          });
        }

        let ownRub = 0, ownU = 0, baseRub = 0;
        const sku = brands[b] + ' 100мг №' + (b === 0 ? 30 : b === 1 ? 20 : 50);

        for (let c = 0; c < 3; c++) {
          const base = 115 * season * trend * (1 + b * 0.22) * regInfo.mult * (1 + c * 0.07);

          // Промо-бонусы:
          const on = regInfo.isTreat && (i % 4 === 1 || (isCampaign && i % 3 === 0));
          const mi = (i * 3 + b + c * 2) % 4;
          const rate = on ? rate0[mi] + ((i + b + c) % 3) * 0.5 : 0;

          // Каузальный подъем в тесте в кампанию (эффект визитов + промо):
          const causalBoost = (regInfo.isTreat && isCampaign) ? 1.28 : 1.0;
          const promoUplift = on ? (1 + base0[mi] + kk[mi] * rate) : 1.0;
          const uplift = promoUplift * causalBoost;

          const units = Math.round(base * uplift + Math.sin(i * 1.2 + b + r + c) * 5);
          const price = prices[b] * (1 + 0.015 * Math.sin(i / 3));
          const rb = Math.round(units * price);

          s.push({
            month: m,
            year: yr,
            monthNum: moNum,
            federalDistrict: regInfo.fedDist,
            federalSubject: regInfo.fedSub,
            nanobrick: regInfo.nanobrick,
            region: regInfo.reg,
            city: regInfo.city,
            chain: chains[c],
            brand: brands[b],
            sku,
            units,
            salesRub: rb
          });

          if (on) {
            p.push({
              month: m,
              year: yr,
              monthNum: moNum,
              nanobrick: regInfo.nanobrick,
              chain: chains[c],
              brand: brands[b],
              sku,
              bonusPct: rate,
              mechanic: mech[mi],
              region: regInfo.reg,
              city: '' // В ТМА нет поля город
            });
          }

          ownRub += rb;
          ownU += units;
          baseRub += base * price;
        }

        const cov = 0.4 * (1 + 0.03 * Math.sin(i * 0.7 + r + b));
        mk.push({
          month: m,
          year: yr,
          monthNum: moNum,
          market: markets[b],
          region: regInfo.fedSub, // В рыночных данных регион это federal_subject
          city: regInfo.city,
          nanobrick: regInfo.nanobrick,
          brand: brands[b],
          sku,
          units: Math.round(ownU / cov),
          salesRub: Math.round(ownRub / cov),
          isOwn: true
        });

        for (let c = 0; c < 3; c++) {
          const rb = Math.round(baseRub / 0.4 * cf[c] * (1 + cg[c] * i) * (1 + 0.05 * Math.sin(i * 0.9 + c + r)));
          mk.push({
            month: m,
            year: yr,
            monthNum: moNum,
            market: markets[b],
            region: regInfo.fedSub, // В рыночных данных регион это federal_subject
            city: regInfo.city,
            nanobrick: regInfo.nanobrick,
            brand: comps[b][c],
            sku: 'C-' + (b + 1) + '-' + (c + 1),
            units: Math.round(rb / (prices[b] * cp[c])),
            salesRub: rb,
            isOwn: false
          });
        }
      }
    }
  }

  return { s, p, t, v, mk };
}
