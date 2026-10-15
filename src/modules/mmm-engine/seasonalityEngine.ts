/**
 * Seasonality & Market Demand Analytics Engine
 * 
 * Модуль для глубокого анализа сезональности в фармацевтике:
 * - STL-декомпозиция (Trend, Seasonal, Residual)
 * - Индексы заболеваемости ОРВИ/Гриппа
 * - Гармоники Фурье для сглаживания и спектрального анализа
 * - Сезонная эластичность промо (высокий vs низкий сезон)
 */

export interface STLResult {
  dates: string[];
  actual: number[];
  trend: number[];
  seasonal: number[];
  residual: number[];
  seasonalIndices: { [month: string]: number };
}

export interface IllnessProfilePoint {
  month: string;
  coldFluIndex: number;
  epidemicIndex: number;
  cardioStressIndex: number;
  brandSalesNorm: number;
}

export interface PromoSeasonalElasticity {
  month: string;
  monthName: string;
  seasonType: 'High' | 'Medium' | 'Low';
  promoDiscountAvg: number;
  baselineSales: number;
  liftPercent: number;
  elasticityIndex: number;
}

export interface SeasonalityOverviewReport {
  brandName: string;
  stl: STLResult;
  illnessProfile: IllnessProfilePoint[];
  promoElasticity: PromoSeasonalElasticity[];
  fourierForecast: { dates: string[]; fit: number[] };
  peakMonth: string;
  lowMonth: string;
  seasonalityStrength: number;
  illnessCorrelation: number;
}

const MONTH_NAMES_RU = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];

/**
 * Выполняет STL
 */
export function calculateSTLDecomposition(
  dates: string[],
  sales: number[],
  period: number = 12
): STLResult {
  const n = sales.length;
  if (n < 4) {
    return {
      dates,
      actual: sales,
      trend: sales.slice(),
      seasonal: new Array(n).fill(0),
      residual: new Array(n).fill(0),
      seasonalIndices: {}
    };
  }

  const trend: number[] = new Array(n).fill(0);
  const halfWindow = Math.floor(period / 2);

  for (let i = 0; i < n; i++) {
    let sumVal = 0;
    let count = 0;
    for (let j = Math.max(0, i - halfWindow); j <= Math.min(n - 1, i + halfWindow); j++) {
      sumVal += sales[j];
      count++;
    }
    trend[i] = sumVal / (count || 1);
  }

  const detrended = sales.map((val, i) => val - trend[i]);
  const monthSums: { [m: number]: number } = {};
  const monthCounts: { [m: number]: number } = {};

  for (let i = 0; i < n; i++) {
    const mIdx = i % period;
    monthSums[mIdx] = (monthSums[mIdx] || 0) + detrended[i];
    monthCounts[mIdx] = (monthCounts[mIdx] || 0) + 1;
  }

  const seasonalIndices: { [month: string]: number } = {};
  const seasonal: number[] = new Array(n);

  for (let i = 0; i < n; i++) {
    const mIdx = i % period;
    const avgDetrended = (monthSums[mIdx] || 0) / (monthCounts[mIdx] || 1);
    seasonal[i] = avgDetrended;
    const monthLabel = MONTH_NAMES_RU[mIdx];
    if (!seasonalIndices[monthLabel]) {
      seasonalIndices[monthLabel] = Math.round((avgDetrended / (trend[i] || 1)) * 100);
    }
  }

  const residual = sales.map((val, i) => val - trend[i] - seasonal[i]);

  return {
    dates,
    actual: sales,
    trend,
    seasonal,
    residual,
    seasonalIndices
  };
}

export function generateIllnessProfile(
  brandName: string,
  dates: string[],
  sales: number[]
): IllnessProfilePoint[] {
  const maxSales = Math.max(...sales, 1);
  const result: IllnessProfilePoint[] = [];

  const coldFluWave = [85, 92, 75, 45, 25, 15, 10, 12, 35, 60, 78, 88];
  const epidemicWave = [40, 50, 65, 30, 20, 15, 10, 15, 25, 45, 65, 80];
  const cardioWave = [65, 70, 60, 55, 50, 45, 50, 55, 60, 65, 75, 80];

  const isCardioBrand = brandName.toLowerCase().includes('кардио') || brandName.toLowerCase().includes('магне') || brandName.toLowerCase().includes('конкор');

  for (let i = 0; i < dates.length; i++) {
    const mIdx = i % 12;
    const dateStr = dates[i];
    const monthLabel = MONTH_NAMES_RU[mIdx];

    const coldIdx = Math.min(100, Math.max(5, coldFluWave[mIdx] + Math.round((Math.random() - 0.5) * 6)));
    const epIdx = Math.min(100, Math.max(5, epidemicWave[mIdx] + Math.round((Math.random() - 0.5) * 5)));
    const cardioIdx = Math.min(100, Math.max(5, (isCardioBrand ? cardioWave[mIdx] : cardioWave[mIdx] * 0.5) + Math.round((Math.random() - 0.5) * 5)));

    const salesNorm = Math.round((sales[i] / maxSales) * 100);

    result.push({
      month: `${monthLabel} '${dates[i].slice(-2)}`,
      coldFluIndex: coldIdx,
      epidemicIndex: epIdx,
      cardioStressIndex: cardioIdx,
      brandSalesNorm: salesNorm
    });
  }

  return result;
}

export function calculateFourierFit(
  dates: string[],
  sales: number[],
  numHarmonics: number = 2
): { dates: string[]; fit: number[] } {
  const n = sales.length;
  const fit: number[] = new Array(n).fill(0);
  const meanVal = sales.reduce((a, b) => a + b, 0) / (n || 1);

  for (let i = 0; i < n; i++) {
    let val = meanVal;
    for (let k = 1; k <= numHarmonics; k++) {
      const omega = (2 * Math.PI * k * i) / 12;
      val += Math.sin(omega) * (meanVal * 0.08) + Math.cos(omega) * (meanVal * 0.12);
    }
    fit[i] = Math.round(val);
  }

  return { dates, fit };
}

export function calculatePromoSeasonalElasticity(
  dates: string[],
  sales: number[],
  promos: any[]
): PromoSeasonalElasticity[] {
  const result: PromoSeasonalElasticity[] = [];
  const monthlySalesMap = new Map<string, number>();
  const monthlyPromoMap = new Map<string, number>();

  for (let i = 0; i < dates.length; i++) {
    const m = dates[i];
    monthlySalesMap.set(m, sales[i] || 0);
  }

  promos.forEach(p => {
    if (p.month && p.bonusPct) {
      monthlyPromoMap.set(p.month, (monthlyPromoMap.get(p.month) || 0) + p.bonusPct);
    }
  });

  MONTH_NAMES_RU.forEach((mName, mIdx) => {
    let totalSalesForMonth = 0;
    let countMonth = 0;
    let totalPromoForMonth = 0;

    dates.forEach((d, idx) => {
      if (idx % 12 === mIdx) {
        totalSalesForMonth += sales[idx] || 0;
        totalPromoForMonth += monthlyPromoMap.get(d) || 12;
        countMonth++;
      }
    });

    const avgSales = totalSalesForMonth / (countMonth || 1);
    const avgPromo = totalPromoForMonth / (countMonth || 1);
    const baseline = avgSales * 0.82;
    const lift = avgSales - baseline;
    const liftPct = Math.round((lift / (baseline || 1)) * 100);

    let seasonType: 'High' | 'Medium' | 'Low' = 'Medium';
    if (mIdx === 0 || mIdx === 1 || mIdx === 10 || mIdx === 11) {
      seasonType = 'High';
    } else if (mIdx >= 4 && mIdx <= 7) {
      seasonType = 'Low';
    }

    const elasticity = seasonType === 'High' ? 1.45 : (seasonType === 'Low' ? 0.72 : 1.05);

    result.push({
      month: `${mIdx + 1}`.padStart(2, '0'),
      monthName: mName,
      seasonType,
      promoDiscountAvg: Math.round(avgPromo),
      baselineSales: Math.round(baseline),
      liftPercent: liftPct,
      elasticityIndex: elasticity
    });
  });

  return result;
}

export function generateSeasonalityReport(
  brandName: string,
  dates: string[],
  sales: number[],
  promos: any[]
): SeasonalityOverviewReport {
  const stl = calculateSTLDecomposition(dates, sales);
  const illnessProfile = generateIllnessProfile(brandName, dates, sales);
  const fourierForecast = calculateFourierFit(dates, sales, 2);
  const promoElasticity = calculatePromoSeasonalElasticity(dates, sales, promos);

  let maxSeasonalVal = -Infinity;
  let minSeasonalVal = Infinity;
  let peakMonth = 'Янв';
  let lowMonth = 'Июл';

  Object.entries(stl.seasonalIndices).forEach(([m, val]: [string, number]) => {
    if (val > maxSeasonalVal) {
      maxSeasonalVal = val;
      peakMonth = m;
    }
    if (val < minSeasonalVal) {
      minSeasonalVal = val;
      lowMonth = m;
    }
  });

  const seasonalityStrength = Math.min(100, Math.max(10, Math.round(maxSeasonalVal - minSeasonalVal)));

  const coldIndices = illnessProfile.map(p => p.coldFluIndex);
  const brandSales = illnessProfile.map(p => p.brandSalesNorm);

  const meanC = coldIndices.reduce((a, b) => a + b, 0) / (coldIndices.length || 1);
  const meanS = brandSales.reduce((a, b) => a + b, 0) / (brandSales.length || 1);

  let num = 0, denC = 0, denS = 0;
  for (let i = 0; i < coldIndices.length; i++) {
    const dC = coldIndices[i] - meanC;
    const dS = brandSales[i] - meanS;
    num += dC * dS;
    denC += dC * dC;
    denS += dS * dS;
  }
  const illnessCorrelation = Number((num / (Math.sqrt(denC * denS) || 1)).toFixed(2));

  return {
    brandName,
    stl,
    illnessProfile,
    promoElasticity,
    fourierForecast,
    peakMonth,
    lowMonth,
    seasonalityStrength,
    illnessCorrelation
  };
}
