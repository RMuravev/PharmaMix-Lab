/**
 * Экономический байесовский оптимизатор маркетингового бюджета
 * 
 * Экономическая функция полезности:
 * Цель: максимизация инкрементальной маржинальной прибыли ΔΠ с учетом насыщения (убывающей отдачи)
 * и риска неопределенности параметров эконометрической модели:
 * 
 * ΔΠ(B) = (ΔSales(B) × Gross Margin) - Total Spend
 * где:
 * - ΔSales_k(B_k) = S_max_k × (B_k^γ / (B_k^γ + K_50_k^γ)) — S-образная функция насыщения Hill;
 * - Gross Margin — маржинальность брендового портфеля (по умолчанию 65%);
 * - Неопределенность: Монте-Карло сэмплирование эластичностей β_k ~ N(β̂_k, SE_k²) для расчета 95% ДИ;
 * - Бюджетные ограничения: Σ B_k = B_total, min_share_k <= B_k / B_total <= max_share_k.
 */

import { fmt, rub } from '../../utils/math';

export interface ChannelBudgetConfig {
  key: string;
  name: string;
  minShare: number; // e.g. 0.10 (10%)
  maxShare: number; // e.g. 0.60 (60%)
  currentSpend: number; // Текущий бюджет в рублях
  beta: number; // Эластичность MMM
  se: number; // Стандартная ошибка эластичности
  halfSaturationRub: number; // Точка полунасыщения K_50 в рублях
  hillExponent: number; // Степень Hill γ (1.0 - 1.5)
}

export interface BudgetOptimizationResult {
  totalBudget: number;
  marginPct: number;
  channels: {
    key: string;
    name: string;
    currentRub: number;
    currentSharePct: number;
    recommendedRub: number;
    recommendedSharePct: number;
    deltaRub: number;
    marginalRoiCurrent: number; // Предельный ROI на текущем уровне (+1 ₽ инвестиций)
    marginalRoiRecommended: number; // Предельный ROI на рекомендованном уровне
    saturationPct: number; // Текущий уровень насыщения канала (%)
  }[];
  // Финансовые результаты сценариев
  currentRevenueUplift: number;
  currentMarginProfit: number;
  recommendedRevenueUplift: number;
  recommendedMarginProfit: number;
  incrementalProfitUplift: number; // Чистый дополнительный выигрыш от перераспределения
  // 95% доверительный интервал для рекомендованной прибыли (Монте-Карло)
  ciLowerProfit: number;
  ciUpperProfit: number;
  stdProfit: number;
  probPositiveProfit: number; // Вероятность, что инкрементальная прибыль > 0 (%)
  riskAdjustedProfit: number; // Ожидаемая прибыль с поправкой на риск (E[Π] - 0.5 * σ)
}

export function runBayesianBudgetOptimization(options: {
  totalBudget?: number;
  marginPct?: number; // 0.65
  currentSpends?: { tv?: number; bonus?: number; visits?: number };
  baseSalesAnnual?: number;
}): BudgetOptimizationResult {
  const totalBudget = options.totalBudget || 5000000; // 5 млн руб.
  const margin = options.marginPct !== undefined ? options.marginPct : 0.65; // 65% маржинальность
  const baseSales = options.baseSalesAnnual || 25000000; // 25 млн руб. годовых базовых продаж

  // Конфигурация 3 ключевых фармацевтических каналов
  const curSpends = options.currentSpends || {};
  const currentTv = curSpends.tv || totalBudget * 0.40;
  const currentBonus = curSpends.bonus || totalBudget * 0.35;
  const currentVisits = curSpends.visits || totalBudget * 0.25;

  const channels: ChannelBudgetConfig[] = [
    {
      key: 'tv',
      name: 'ТВ-реклама (TRP)',
      minShare: 0.10,
      maxShare: 0.60,
      currentSpend: currentTv,
      beta: 0.18, // Эластичность по продажам
      se: 0.035, // Стандартная ошибка
      halfSaturationRub: totalBudget * 0.45,
      hillExponent: 1.15
    },
    {
      key: 'bonus',
      name: 'Аптечные бонусы (%)',
      minShare: 0.10,
      maxShare: 0.55,
      currentSpend: currentBonus,
      beta: 0.22, // Высокая прямая отдача трейд-маркетинга
      se: 0.040,
      halfSaturationRub: totalBudget * 0.35,
      hillExponent: 1.25
    },
    {
      key: 'visits',
      name: 'Визиты медпредставителей',
      minShare: 0.15,
      maxShare: 0.60,
      currentSpend: currentVisits,
      beta: 0.20,
      se: 0.038,
      halfSaturationRub: totalBudget * 0.40,
      hillExponent: 1.20
    }
  ];

  // Функция прироста выручки по каналу: S_k(B_k) = S_max * (B_k^γ / (B_k^γ + K_50^γ))
  const computeChannelRevenue = (ch: ChannelBudgetConfig, spend: number, betaOverride?: number): number => {
    const b = betaOverride !== undefined ? betaOverride : ch.beta;
    const maxPotential = baseSales * b * 2.0;
    const x = Math.max(0, spend);
    const gamma = ch.hillExponent;
    const k50 = ch.halfSaturationRub;
    const hillRatio = Math.pow(x, gamma) / (Math.pow(x, gamma) + Math.pow(k50, gamma));
    return maxPotential * hillRatio;
  };

  // Предельный доход (первая производная dRevenue / dSpend)
  const computeMarginalRoi = (ch: ChannelBudgetConfig, spend: number): number => {
    const eps = 1000;
    const rev1 = computeChannelRevenue(ch, spend);
    const rev2 = computeChannelRevenue(ch, spend + eps);
    const dRev = (rev2 - rev1) / eps;
    // Предельный ROI = (прирост выручки * маржа - 1)
    return dRev * margin - 1.0;
  };

  // Численный поиск оптимума по сетке долей с шагом 1%
  let bestShares: number[] = [0.33, 0.33, 0.34];
  let bestProfit = -Infinity;

  const step = 0.02; // 2% шаг
  for (let s0 = channels[0].minShare; s0 <= channels[0].maxShare; s0 += step) {
    for (let s1 = channels[1].minShare; s1 <= channels[1].maxShare; s1 += step) {
      const s2 = 1.0 - s0 - s1;
      if (s2 < channels[2].minShare - 1e-4 || s2 > channels[2].maxShare + 1e-4) continue;

      const spends = [s0 * totalBudget, s1 * totalBudget, s2 * totalBudget];
      let totalRev = 0;
      for (let i = 0; i < 3; i++) {
        totalRev += computeChannelRevenue(channels[i], spends[i]);
      }
      const profit = totalRev * margin - totalBudget;
      if (profit > bestProfit) {
        bestProfit = profit;
        bestShares = [s0, s1, s2];
      }
    }
  }

  // Нормализация до 100%
  const sumShares = bestShares[0] + bestShares[1] + bestShares[2];
  bestShares = bestShares.map(s => s / sumShares);

  // Расчет показателей для текущего и рекомендованного сценариев
  let currentTotalRev = 0;
  for (let i = 0; i < 3; i++) {
    currentTotalRev += computeChannelRevenue(channels[i], channels[i].currentSpend);
  }
  const currentMarginProfit = currentTotalRev * margin - totalBudget;

  let recommendedTotalRev = 0;
  const recommendedSpends = bestShares.map(s => Math.round(s * totalBudget));
  for (let i = 0; i < 3; i++) {
    recommendedTotalRev += computeChannelRevenue(channels[i], recommendedSpends[i]);
  }
  const recommendedMarginProfit = recommendedTotalRev * margin - totalBudget;
  const incrementalProfitUplift = recommendedMarginProfit - currentMarginProfit;

  // Монте-Карло симуляция неопределенности (1000 итераций)
  const monteCarloProfits: number[] = [];
  const mcIterations = 1000;

  // Box-Muller нормальное сэмплирование
  const randNorm = (mu: number, sigma: number) => {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return mu + sigma * Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  };

  for (let iter = 0; iter < mcIterations; iter++) {
    let simRev = 0;
    for (let i = 0; i < 3; i++) {
      const sampledBeta = Math.max(0.01, randNorm(channels[i].beta, channels[i].se));
      simRev += computeChannelRevenue(channels[i], recommendedSpends[i], sampledBeta);
    }
    const simProfit = simRev * margin - totalBudget;
    monteCarloProfits.push(simProfit);
  }

  monteCarloProfits.sort((a, b) => a - b);
  const ciLowerProfit = monteCarloProfits[Math.floor(mcIterations * 0.025)];
  const ciUpperProfit = monteCarloProfits[Math.floor(mcIterations * 0.975)];
  const meanSim = monteCarloProfits.reduce((a, b) => a + b, 0) / mcIterations;
  const stdProfit = Math.sqrt(monteCarloProfits.reduce((a, b) => a + (b - meanSim) ** 2, 0) / mcIterations);
  const positiveCount = monteCarloProfits.filter(p => p > 0).length;
  const probPositive = (positiveCount / mcIterations) * 100;
  const riskAdjustedProfit = recommendedMarginProfit - 0.5 * stdProfit;

  const channelOut = channels.map((ch, i) => {
    const recRub = recommendedSpends[i];
    const curRub = ch.currentSpend;
    const curShare = (curRub / totalBudget) * 100;
    const recShare = (recRub / totalBudget) * 100;
    const maxRev = baseSales * ch.beta * 2.0;
    const satLevel = (computeChannelRevenue(ch, recRub) / Math.max(1, maxRev)) * 100;

    return {
      key: ch.key,
      name: ch.name,
      currentRub: curRub,
      currentSharePct: curShare,
      recommendedRub: recRub,
      recommendedSharePct: recShare,
      deltaRub: recRub - curRub,
      marginalRoiCurrent: computeMarginalRoi(ch, curRub),
      marginalRoiRecommended: computeMarginalRoi(ch, recRub),
      saturationPct: satLevel
    };
  });

  return {
    totalBudget,
    marginPct: margin,
    channels: channelOut,
    currentRevenueUplift: currentTotalRev,
    currentMarginProfit,
    recommendedRevenueUplift: recommendedTotalRev,
    recommendedMarginProfit,
    incrementalProfitUplift,
    ciLowerProfit,
    ciUpperProfit,
    stdProfit,
    probPositiveProfit: probPositive,
    riskAdjustedProfit
  };
}

export function simulateBudgetBayesianOptimization(budget: {
  total_trp?: number;
  total_bonus?: number;
}): any[] {
  const total = (budget.total_trp || 150000) + (budget.total_bonus || 80000) + 120000;
  const opt = runBayesianBudgetOptimization({
    totalBudget: total,
    marginPct: 0.65,
    currentSpends: {
      tv: budget.total_trp || 150000,
      bonus: budget.total_bonus || 80000,
      visits: 120000
    }
  });
  return opt.channels.map((c, i) => ({
    rank: i + 1,
    city: c.name,
    trp: c.recommendedRub,
    bonus: Math.round(c.recommendedRub * 0.4),
    roi: c.marginalRoiRecommended + 1.0,
    uncertainty: 0.15,
    ei: opt.riskAdjustedProfit / 1e6
  }));
}

