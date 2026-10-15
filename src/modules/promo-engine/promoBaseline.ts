/**
 * Чистый расчет базовых продаж промо (Baseline) и де-промо моделей
 * Поддерживает скользящую базу, контрфактуальную модель и двойной ансамбль
 */

import { DerivedStructures, ModelFit, PromoAtom, SettingsConfig } from '../../types/pharma';
import { SEP, avg, mAdd } from '../../utils/math';

export function evaluatePromoBaselines(
  derived: DerivedStructures,
  settings: SettingsConfig,
  regModel?: ModelFit | null
): {
  atoms: PromoAtom[];
  promoRows: number;
  adjFail: number;
  dualStats: {
    sumRollingDR: number;
    sumCfDR: number;
    countDual: number;
  };
} {
  const atoms: PromoAtom[] = [];
  let adjFail = 0;
  let rows = 0;

  // Определение коэффициента эластичности промо из эконометрической модели (или дефолт 0.038)
  let betaBonus = 0.038;
  if (regModel && regModel.fit && regModel.fit.m && regModel.spec && regModel.spec.names) {
    const bIdx = regModel.spec.names.indexOf('bonusIdx');
    if (bIdx >= 0 && regModel.fit.m.beta && regModel.fit.m.beta[bIdx] > 0) {
      betaBonus = Math.min(0.12, Math.max(0.015, regModel.fit.m.beta[bIdx]));
    }
  }

  let sumRollingDR = 0;
  let sumCfDR = 0;
  let countDual = 0;

  for (const x of derived.salesFine.values()) {
    if (!(x.rate > 0)) continue;
    rows++;

    const skuKey = [x.region, x.chain, x.brand, x.sku].join(SEP);
    const skuFirst = (derived.skuFirstMonth && derived.skuFirstMonth.get(skuKey)) || x.month;

    // 1. Скользящая база (Moving Average) с учетом нулевых продаж
    const pastUnits: number[] = [];
    const pastRub: number[] = [];
    const pastIdx: any[] = [];

    for (let j = 1; j <= settings.nM; j++) {
      const pm = mAdd(x.month, -j);
      if (pm < skuFirst) {
        // Месяц до первого появления SKU в сети — не штрафуем
        continue;
      }
      const pr = derived.salesFine.get([pm, x.region, x.city, x.chain, x.brand, x.sku].join(SEP));
      if (pr) {
        if (settings.excl && pr.rate > 0) continue; // Исключаем промо-периоды из чистой базы
        pastUnits.push(pr.units || 0);
        pastRub.push(pr.rub || 0);
        const mkKey = derived.brandMarket.get(x.brand) || '';
        const mktVal = derived.mktIdx.get([mkKey, x.federalSubject || x.region, pm].join(SEP))
          || derived.mktIdx.get([mkKey, 'РФ', pm].join(SEP))
          || derived.mktIdx.get([mkKey, '', pm].join(SEP));
        pastIdx.push(mktVal);
      } else {
        // Пробел в продажах (месяц с 0 продаж): строки нет в файле = строго 0 продаж
        pastUnits.push(0);
        pastRub.push(0);
        const mkKey = derived.brandMarket.get(x.brand) || '';
        const mktVal = derived.mktIdx.get([mkKey, x.federalSubject || x.region, pm].join(SEP))
          || derived.mktIdx.get([mkKey, 'РФ', pm].join(SEP))
          || derived.mktIdx.get([mkKey, '', pm].join(SEP));
        pastIdx.push(mktVal);
      }
    }

    let baseURolling = NaN, baseRRolling = NaN;
    if (pastRub.length >= settings.minH && pastRub.length > 0) {
      baseURolling = avg(pastUnits);
      baseRRolling = avg(pastRub);
      if (settings.adj) {
        let ok = false;
        const mk = derived.brandMarket.get(x.brand);
        if (mk) {
          const cur = derived.mktIdx.get([mk, x.region, x.month].join(SEP))
            || derived.mktIdx.get([mk, 'РФ', x.month].join(SEP))
            || derived.mktIdx.get([mk, '', x.month].join(SEP));
          if (cur && pastIdx.every(Boolean)) {
            const mr = avg(pastIdx.map((p: any) => p.rub));
            const mu = avg(pastIdx.map((p: any) => p.units));
            if (mr > 0 && mu > 0) {
              baseRRolling *= cur.rub / mr;
              baseURolling *= cur.units / mu;
              ok = true;
            }
          }
        }
        if (!ok) adjFail++;
      }
    }

    // 2. Контрфактуальная модель (Counterfactual De-promo)
    const cfLift = Math.max(1.0, 1.0 + betaBonus * x.rate);
    const baseRCf = x.rub / cfLift;
    const baseUCf = x.units / cfLift;

    // 3. Синтез выбранной методики (dual / rolling / counterfactual)
    let baseR = NaN, baseU = NaN;
    const hasRolling = Number.isFinite(baseRRolling) && Number.isFinite(baseURolling);

    if (settings.method === 'rolling') {
      baseR = baseRRolling;
      baseU = baseURolling;
    } else if (settings.method === 'counterfactual') {
      baseR = baseRCf;
      baseU = baseUCf;
    } else {
      // Dual: ансамбль скользящей базы и контрфактуала
      if (hasRolling) {
        baseR = (baseRRolling + baseRCf) / 2;
        baseU = (baseURolling + baseUCf) / 2;
        sumRollingDR += Math.max(0, x.rub - baseRRolling);
        sumCfDR += Math.max(0, x.rub - baseRCf);
        countDual++;
      } else {
        baseR = baseRCf;
        baseU = baseUCf;
      }
    }

    const valid = Number.isFinite(baseR) && Number.isFinite(baseU);
    for (const m of x.mechs) {
      const w = m.rate / x.rate;
      atoms.push({
        fid: x.id,
        month: x.month,
        region: x.region,
        city: x.city,
        chain: x.chain,
        brand: x.brand,
        sku: x.sku,
        mech: m.m,
        rate: m.rate,
        valid,
        actU: x.units * w,
        actR: x.rub * w,
        actUV: valid ? x.units * w : 0,
        actRV: valid ? x.rub * w : 0,
        baseU: valid ? baseU * w : 0,
        baseR: valid ? baseR * w : 0,
        baseURolling: hasRolling ? baseURolling * w : NaN,
        baseRRolling: hasRolling ? baseRRolling * w : NaN,
        baseUCf: baseUCf * w,
        baseRCf: baseRCf * w,
        bonus: x.rub * m.rate / 100,
        bonusV: valid ? x.rub * m.rate / 100 : 0
      });
    }
  }

  return {
    atoms,
    promoRows: rows,
    adjFail,
    dualStats: { sumRollingDR, sumCfDR, countDual }
  };
}
