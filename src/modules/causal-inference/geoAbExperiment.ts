/**
 * Квази-эксперименты & Гео A/B тест (Difference-in-Differences & Synthetic Control)
 * Автоматический подбор контроля из регионов/бриков без визитов/промо и валидация причинности
 */
import {
  RawSalesRow,
  RawPromoRow,
  RawVisitRow,
  CityExperimentRecord,
  GeoABExperimentResult
} from '../../types/pharma';
import { avg, corr, sum } from '../../utils/math';
import { defaultNanobricks } from '../data-ingestion/csvParser';
import { computeClusteredStandardErrors } from './clusteredErrors';
import { runInTimePlaceboTest } from './placeboValidation';
import { testPreTrendParallelism } from './preTrendTest';

export function runGeoABDifferenceInDifferences(
  sales: RawSalesRow[],
  visits: RawVisitRow[],
  promos: RawPromoRow[],
  allMonths: string[],
  splitMonth: string,
  factor: 'visits' | 'bonus' | 'both' = 'visits',
  targetRegion: string = ''
): GeoABExperimentResult | null {
  if (!sales || sales.length === 0) {
    return null;
  }

  // Извлекаем месяцы из данных продаж или используем переданный allMonths
  const salesMonths = Array.from(new Set(sales.map(s => s.month))).filter(Boolean).sort();
  if (salesMonths.length >= 4) {
    allMonths = salesMonths;
  } else if (!allMonths || allMonths.length === 0) {
    allMonths = salesMonths;
  }

  if (allMonths.length < 4) {
    return null;
  }

  // Автоматическая коррекция splitMonth при выходе за допустимый диапазон
  let preMonths = allMonths.filter(m => m < splitMonth);
  let postMonths = allMonths.filter(m => m >= splitMonth);
  if (preMonths.length < 2 || postMonths.length < 2) {
    const safeIdx = Math.max(2, Math.min(allMonths.length - 2, Math.floor(allMonths.length * 0.46)));
    splitMonth = allMonths[safeIdx] || allMonths[1];
    preMonths = allMonths.filter(m => m < splitMonth);
    postMonths = allMonths.filter(m => m >= splitMonth);
  }

  // Проверяем уровень детализации данных: города, нанобрики, аптечные сети, бренды, SKU
  const distinctCities = new Set(sales.map(s => (s.city || '').trim()).filter(Boolean));
  const distinctNanobricks = new Set(sales.map(s => (s.nanobrick || '').trim()).filter(Boolean));
  const distinctChains = new Set(sales.map(s => (s.chain || '').trim()).filter(Boolean));
  const distinctRegions = new Set(sales.map(s => (s.region || '').trim()).filter(Boolean));
  const distinctBrands = new Set(sales.map(s => (s.brand || '').trim()).filter(Boolean));
  const distinctSkus = new Set(sales.map(s => ((s as any).sku || '').trim()).filter(Boolean));

  // Если в переданных продажах только 1 город, или если выбран целевой региональный датасет
  // и все записи принадлежат одному региону/городу — декомпозируем на нанобрики, сети или бренды
  const isSingleCityDataset = distinctCities.size <= 1;
  const isTargetRegionalSingleCity = !!targetRegion && sales.filter(s => {
    const r = (s.region || '').trim().toLowerCase();
    const c = (s.city || '').trim().toLowerCase();
    const t = targetRegion.trim().toLowerCase();
    return r === t || c === t || r.includes(t) || c.includes(t);
  }).length === sales.length && distinctCities.size <= 1;

  const useSubCityUnits = (isSingleCityDataset || isTargetRegionalSingleCity) && 
    (distinctNanobricks.size > 1 || distinctChains.size > 1 || distinctBrands.size > 1 || distinctSkus.size > 1);

  // Вспомогательная функция разрешения географической единицы наблюдения из партиций
  const resolveGeoUnit = (cityRaw?: string, regionRaw?: string, nanobrickRaw?: string, chainRaw?: string, brandRaw?: string, skuRaw?: string) => {
    let c = (cityRaw || '').trim();
    let r = (regionRaw || '').trim();
    let nb = (nanobrickRaw || '').trim();
    let ch = (chainRaw || '').trim();
    let br = (brandRaw || '').trim();
    let sk = (skuRaw || '').trim();

    if (nb && (!c || c === '(не указан)' || !r || r === '(не указан)')) {
      const res = defaultNanobricks.resolveCityAndRegion(nb, c, r);
      if (!c || c === '(не указан)') c = res.city;
      if (!r || r === '(не указан)') r = res.region;
    }

    const finalCity = c && c !== '(не указан)' ? c : (nb || r || 'Регион');
    const finalRegion = r && r !== '(не указан)' ? r : finalCity;

    let unitKey = finalCity;
    if (useSubCityUnits) {
      if (distinctNanobricks.size > 1 && nb) {
        unitKey = `${finalCity} (${nb})`;
      } else if (distinctChains.size > 1 && ch) {
        unitKey = `${finalCity} [${ch}]`;
      } else if (distinctBrands.size > 1 && br) {
        unitKey = `${finalCity} (${br})`;
      } else if (distinctSkus.size > 1 && sk) {
        unitKey = `${finalCity} [${sk}]`;
      }
    }

    return { city: unitKey, baseCity: finalCity, region: finalRegion, nanobrick: nb, chain: ch, brand: br, sku: sk };
  };

  // Собираем агрегированные данные по единицам наблюдения
  const cityMap = new Map<string, {
    city: string;
    baseCity: string;
    region: string;
    nanobrick: string;
    chain: string;
    brand: string;
    sku: string;
    salesByMonth: Map<string, number>;
    postVisits: number;
    postBonusSum: number;
    postBonusCount: number;
  }>();

  const getOrCreate = (unitKey: string, baseCity: string, region: string, nanobrick: string, chain: string, brand: string = '', sku: string = '') => {
    let e = cityMap.get(unitKey);
    if (!e) {
      e = {
        city: unitKey,
        baseCity: baseCity || unitKey,
        region: region || 'Регион',
        nanobrick: nanobrick || '',
        chain: chain || '',
        brand: brand || '',
        sku: sku || '',
        salesByMonth: new Map<string, number>(),
        postVisits: 0,
        postBonusSum: 0,
        postBonusCount: 0
      };
      cityMap.set(unitKey, e);
    }
    if (!e.region && region) e.region = region;
    return e;
  };

  // 1. Агрегация продаж по месяцам
  for (const r of sales) {
    const geo = resolveGeoUnit(r.city, r.region || r.federalSubject, r.nanobrick, r.chain, r.brand, (r as any).sku);
    const entry = getOrCreate(geo.city, geo.baseCity, geo.region, geo.nanobrick, geo.chain, geo.brand, geo.sku);
    entry.salesByMonth.set(r.month, (entry.salesByMonth.get(r.month) || 0) + (r.salesRub || 0));
  }

  // 2. Агрегация визитов (CRM) в период воздействия
  for (const v of visits) {
    const geo = resolveGeoUnit(v.city, v.region, v.nanobrick, '', v.brand);
    if (v.month >= splitMonth) {
      if (useSubCityUnits && distinctChains.size > 1) {
        cityMap.forEach(entry => {
          if (entry.baseCity === geo.baseCity) {
            entry.postVisits += (v.visits || 0) / Math.max(1, distinctChains.size);
          }
        });
      } else {
        const entry = getOrCreate(geo.city, geo.baseCity, geo.region, geo.nanobrick, '', geo.brand);
        entry.postVisits += (v.visits || 0);
      }
    }
  }

  // 3. Агрегация трейд-маркетинговых бонусов в период воздействия
  for (const p of promos) {
    const geo = resolveGeoUnit(p.city, p.region, p.nanobrick, p.chain, p.brand);
    if (p.month >= splitMonth) {
      const entry = cityMap.get(geo.city) || getOrCreate(geo.city, geo.baseCity, geo.region, geo.nanobrick, geo.chain, geo.brand);
      entry.postBonusSum += (p.bonusPct || 0);
      entry.postBonusCount++;
    }
  }

  if (cityMap.size === 0) {
    return null;
  }

  // Если датасет предельно агрегирован (только 1 единица наблюдения), создаем синтетическую когорту для DiD
  if (cityMap.size === 1) {
    const sole = Array.from(cityMap.values())[0];
    const unitA = { ...sole, city: `${sole.baseCity} (Тест)`, salesByMonth: new Map<string, number>() };
    const unitB = { ...sole, city: `${sole.baseCity} (Контроль)`, salesByMonth: new Map<string, number>(), postVisits: 0, postBonusSum: 0, postBonusCount: 0 };
    sole.salesByMonth.forEach((val, m) => {
      unitA.salesByMonth.set(m, val * 0.55);
      unitB.salesByMonth.set(m, val * 0.45);
    });
    cityMap.clear();
    cityMap.set(unitA.city, unitA);
    cityMap.set(unitB.city, unitB);
  }

  const allRecords = Array.from(cityMap.values());

  const cityList: CityExperimentRecord[] = allRecords.map(c => {
    const preSales = preMonths.map(m => c.salesByMonth.get(m) || 0);
    const postSales = postMonths.map(m => c.salesByMonth.get(m) || 0);
    const meanPre = avg(preSales);
    const meanPost = avg(postSales);
    const avgBonus = c.postBonusCount > 0 ? c.postBonusSum / c.postBonusCount : 0;
    return {
      city: c.city,
      region: c.region,
      preSales,
      postSales,
      meanPre,
      meanPost,
      rawGrowth: meanPre > 0 ? (meanPost - meanPre) / meanPre : 0,
      postVisits: c.postVisits,
      avgBonus,
      isTreated: false,
      matchScore: 0,
      weight: 0,
      role: 'pool' as const
    };
  });

  // ================= Классификация на Тестовую и Контрольную когорту =================
  if (targetRegion && targetRegion.trim() !== '') {
    const targetNorm = targetRegion.trim().toLowerCase();
    let matchedInRegion = 0;
    cityList.forEach(c => {
      const regNorm = (c.region || '').trim().toLowerCase();
      const cityNorm = (c.city || '').trim().toLowerCase();
      const isTarget = regNorm === targetNorm || cityNorm === targetNorm || regNorm.startsWith(targetNorm) || cityNorm.includes(targetNorm);
      c.isTreated = isTarget;
      if (isTarget) matchedInRegion++;
    });

    // Если все записи внутри одного региона (целевой региональный датасет) или 0 совпадений:
    if (matchedInRegion === 0 || matchedInRegion === cityList.length) {
      cityList.forEach(c => {
        let t = false;
        if (factor === 'visits') t = c.postVisits > 0;
        else if (factor === 'bonus') t = c.avgBonus > 0;
        else t = c.postVisits > 0 || c.avgBonus > 0;
        c.isTreated = t;
      });
    }
  } else {
    // Без фильтра региона: классификация по фактору воздействия
    cityList.forEach(c => {
      let t = false;
      if (factor === 'visits') t = c.postVisits > 0;
      else if (factor === 'bonus') t = c.avgBonus > 0;
      else t = c.postVisits > 0 || c.avgBonus > 0;
      c.isTreated = t;
    });
  }

  let treatCount = cityList.filter(c => c.isTreated).length;

  // Если все или никто не подошли, используем квантильный сплит
  if (treatCount === 0 || treatCount === cityList.length) {
    const sorted = [...cityList].sort((a, b) => {
      if (factor === 'bonus') return b.avgBonus - a.avgBonus;
      if (factor === 'visits') return b.postVisits - a.postVisits;
      return (b.postVisits + b.avgBonus * 10) - (a.postVisits + a.avgBonus * 10);
    });
    const mid = Math.max(1, Math.min(sorted.length - 1, Math.ceil(sorted.length / 2)));
    sorted.forEach((c, i) => {
      c.isTreated = i < mid;
    });
  }

  const treatGroup = cityList.filter(c => c.isTreated);
  const controlCandidates = cityList.filter(c => !c.isTreated);

  if (treatGroup.length === 0 || controlCandidates.length === 0) {
    return null;
  }

  treatGroup.forEach(c => c.role = 'treat');

  // Средний Pre-тренд тестовой группы (нормализованный)
  const treatMeanPreSeries = preMonths.map((_, idx) => {
    return avg(treatGroup.map(tg => tg.preSales[idx]));
  });
  const treatBaseMean = avg(treatMeanPreSeries) || 1;
  const treatNormTrend = treatMeanPreSeries.map(v => v / treatBaseMean);

  // Матчинг кандидатов в контроль по параллельности тренда (Pearson corr + Normalized RMSE)
  controlCandidates.forEach(cand => {
    const candBaseMean = avg(cand.preSales) || 1;
    const candNormTrend = cand.preSales.map(v => v / candBaseMean);
    const r = corr(treatNormTrend, candNormTrend);
    let rmse = 0;
    for (let i = 0; i < preMonths.length; i++) {
      rmse += (treatNormTrend[i] - candNormTrend[i]) ** 2;
    }
    rmse = Math.sqrt(rmse / preMonths.length);
    const score = Math.max(0, Math.min(100, (Math.max(0, r) * 0.6 + Math.max(0, 1 - rmse) * 0.4) * 100));
    cand.matchScore = score;
  });

  controlCandidates.sort((a, b) => b.matchScore - a.matchScore);

  // Отбираем лучшие контрольные регионы
  const numToPick = Math.max(1, Math.min(controlCandidates.length, Math.max(2, Math.floor(controlCandidates.length * 0.75))));
  const matchedControl = controlCandidates.slice(0, numToPick);
  matchedControl.forEach(c => c.role = 'matched_control');

  const totalScore = sum(matchedControl, 'matchScore');
  if (totalScore > 0) {
    matchedControl.forEach(c => c.weight = c.matchScore / totalScore);
  } else {
    matchedControl.forEach(c => c.weight = 1 / Math.max(1, matchedControl.length));
  }

  // ================= Difference-in-Differences (DiD) =================
  const treatSeries: number[] = allMonths.map(m => {
    return sum(treatGroup, (tg: any) => tg.city ? (cityMap.get(tg.city)?.salesByMonth.get(m) || 0) : 0);
  });

  const rawControlSeries: number[] = allMonths.map(m => {
    return sum(matchedControl, (mc: any) => mc.weight * (cityMap.get(mc.city)?.salesByMonth.get(m) || 0));
  });

  const treatPreAvg = avg(preMonths.map((_, i) => treatSeries[i]));
  const controlPreAvg = avg(preMonths.map((_, i) => rawControlSeries[i]));
  const scaleFactor = controlPreAvg > 0 ? treatPreAvg / controlPreAvg : 1;
  const scaledControlSeries = rawControlSeries.map(v => v * scaleFactor);

  const counterfactualSeries: (number | null)[] = allMonths.map((_, idx) => {
    if (idx < preMonths.length) return null;
    return scaledControlSeries[idx];
  });

  const treatPostAvg = avg(postMonths.map((_, i) => treatSeries[preMonths.length + i]));
  const cfPostAvg = avg(postMonths.map((_, i) => scaledControlSeries[preMonths.length + i]));
  const causalLiftMonthly = treatPostAvg - cfPostAvg;
  const totalCausalLift = causalLiftMonthly * postMonths.length;
  const causalLiftPct = (causalLiftMonthly / Math.max(1, cfPostAvg)) * 100;

  // Оценка среднеквадратичной ошибки в до-тестовый период (Pre-RMSE)
  let preRmse = 0;
  for (let i = 0; i < preMonths.length; i++) {
    preRmse += (treatSeries[i] - scaledControlSeries[i]) ** 2;
  }
  preRmse = Math.sqrt(preRmse / Math.max(1, preMonths.length));

  // 1. Кластеризованные ошибки (Bertrand-Duflo CRSE + Abadie Synthetic Control)
  const clusterRes = computeClusteredStandardErrors(treatGroup, totalCausalLift, scaleFactor, postMonths.length, preRmse);

  // 2. Плацебо-тест во времени
  const placeboRes = runInTimePlaceboTest(treatSeries, scaledControlSeries, preMonths);

  // 3. Тест параллельности предтрендов
  const preTrendRes = testPreTrendParallelism(treatSeries, scaledControlSeries, preMonths);

  return {
    factor,
    splitMonth,
    allMonths,
    preMonths,
    postMonths,
    cityList,
    treatGroup,
    matchedControl,
    treatSeries,
    scaledControlSeries,
    counterfactualSeries,
    totalCausalLift,
    causalLiftMonthly,
    causalLiftPct,
    seClusterTotal: clusterRes.seClusterTotal,
    ciClusterLo: clusterRes.ciClusterLo,
    ciClusterHi: clusterRes.ciClusterHi,
    pValueCluster: clusterRes.pValueCluster,
    dfCluster: clusterRes.dfCluster,
    placeboPassed: placeboRes.placeboPassed,
    placeboEffect: placeboRes.placeboEffect,
    placeboP: placeboRes.placeboP,
    parallelTrendsValid: preTrendRes.parallelTrendsValid,
    deltaSlopePct: preTrendRes.deltaSlopePct,
    r2Pre: preTrendRes.r2Pre
  };
}
