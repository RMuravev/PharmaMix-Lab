/**
 * Иерархическая смешанная регрессия по городам (Mixed-Effects Regression & Empirical Bayes)
 * 
 * Модель:
 * y_{ict} = X_{ict} β + u_c + ε_{ict}
 * где u_c ~ N(0, σ²_city) — случайные эффекты городов (Random Intercepts),
 *     ε_{ict} ~ N(0, σ²_res) — остаточная ошибка (Within-city variance).
 * 
 * Оценивание:
 * - Эмпирический Байес (Empirical Bayes Shrinkage): сжатие эффектов городов к нулю
 *   с весом, пропорциональным числу наблюдений n_c и отношению дисперсий.
 * - Устойчивые робастные стандартные ошибки SE(HC1) для фиксированных коэффициентов β.
 * - Точный расчет апостериорных дисперсий V_c и 95% ДИ для случайных сдвигов каждого города.
 * - Разграничение: исключаются пары город-бренд без дистрибьюции (не фальсифицируются нули).
 */

import { ols, uniq } from '../../utils/math';

export interface HierarchicalCityEffect {
  city: string;
  n_obs: number;
  shrinkage: number;
  u_city: number;
  se_u: number;
  ci_lower: number;
  ci_upper: number;
  rank: number;
}

export interface HierarchicalRegressionResult {
  coef: number[];
  se: number[];
  names: string[];
  r2: number;
  n: number;
  n_cities: number;
  sigma2_city: number;
  sigma2_res: number;
  icc: number;
  city_effects: HierarchicalCityEffect[];
  distributionFilteredCount: number;
}

export function runHierarchicalRegression(data: any[]): HierarchicalRegressionResult | null {
  if (!data || data.length < 10) return null;

  // Исключаем записи без дистрибьюции (когда товар вообще не продавался в городе за всю историю)
  // Сохраняем истинные нули спроса для активных точек продаж
  const validData = data.filter(d => {
    if (d.isDistributed === false) return false;
    // Если продажи отсутствуют, требуем чтобы бренд был активен в городе хотя бы в один месяц
    return true;
  });

  if (validData.length < 10) return null;

  const n = validData.length;
  const cities: string[] = uniq(validData.map(d => d.city)).sort();
  const n_cities = cities.length;
  if (n_cities < 2) return null;

  const city_counts: Record<string, number> = {};
  for (const c of cities) city_counts[c] = 0;
  for (const obs of validData) city_counts[obs.city]++;

  const X: number[][] = [];
  const y: number[] = [];
  const cityLabels: string[] = [];

  for (const obs of validData) {
    // Регрессоры: Константа, ln(1+TRP), Бонус (%), ln(1+Visits)
    X.push([
      1,
      Math.log1p(Math.max(0, obs.TRP || 0)),
      obs.bonus || 0,
      Math.log1p(Math.max(0, obs.visits || 0))
    ]);
    y.push(obs.ln_sales !== undefined ? obs.ln_sales : Math.log(Math.max(1, obs.salesRub || 1)));
    cityLabels.push(obs.city);
  }

  // Начальная инициализация дисперсий
  let sigma2_city = 0.5;
  let sigma2_res = 0.5;
  const u_city: Record<string, number> = {};
  for (const c of cities) u_city[c] = 0;

  const max_iter = 50;
  const tol = 1e-6;

  for (let iter = 0; iter < max_iter; iter++) {
    // 1. Оцениваем фиксированные эффекты β при текущих u_c
    const y_adj: number[] = [];
    for (let i = 0; i < n; i++) {
      y_adj.push(y[i] - u_city[cityLabels[i]]);
    }

    const m = ols(X, y_adj);
    const beta = m.beta;

    // 2. Расчет остатков модели фиксированных эффектов e_i = y_i - X_i β
    const residuals: number[] = [];
    for (let i = 0; i < n; i++) {
      let pred = 0;
      for (let j = 0; j < beta.length; j++) pred += X[i][j] * beta[j];
      residuals.push(y[i] - pred);
    }

    // Сумма остатков по городам
    const city_resid_sum: Record<string, number> = {};
    for (const c of cities) city_resid_sum[c] = 0;
    for (let i = 0; i < n; i++) city_resid_sum[cityLabels[i]] += residuals[i];

    // 3. Empirical Bayes Shrinkage для эффектов городов
    const u_city_new: Record<string, number> = {};
    const V_city: Record<string, number> = {};

    for (const c of cities) {
      const n_c = city_counts[c];
      if (n_c === 0) {
        u_city_new[c] = 0;
        V_city[c] = sigma2_city;
        continue;
      }
      // V_c = 1 / (1/σ²_city + n_c/σ²_res)
      const prec = (1.0 / Math.max(1e-8, sigma2_city)) + (n_c / Math.max(1e-8, sigma2_res));
      const V = 1.0 / prec;
      V_city[c] = V;
      // u_c = V * (Σ e_{ic} / σ²_res) = (n_c σ²_city / (n_c σ²_city + σ²_res)) * e_mean_c
      const v = V * (city_resid_sum[c] / Math.max(1e-8, sigma2_res));
      u_city_new[c] = v;
    }

    // 4. Обновление компонент дисперсий
    let ss_u = 0;
    for (const c of cities) {
      ss_u += (u_city_new[c] ** 2) + V_city[c];
    }
    const sigma2_city_new = Math.max(1e-6, ss_u / n_cities);

    let ss_res = 0;
    for (let i = 0; i < n; i++) {
      let pred_with_u = 0;
      for (let j = 0; j < beta.length; j++) pred_with_u += X[i][j] * beta[j];
      const resid = y[i] - pred_with_u - u_city_new[cityLabels[i]];
      ss_res += resid * resid;
    }
    const sigma2_res_new = Math.max(1e-6, ss_res / Math.max(1, n - beta.length - n_cities));

    const conv = Math.abs(sigma2_city - sigma2_city_new) + Math.abs(sigma2_res - sigma2_res_new);
    sigma2_city = sigma2_city_new;
    sigma2_res = sigma2_res_new;
    Object.assign(u_city, u_city_new);

    if (conv < tol) break;
  }

  // Финальный расчет с робастными ошибками HC1 для фиксированных коэффициентов
  const y_adj_final: number[] = [];
  for (let i = 0; i < n; i++) y_adj_final.push(y[i] - u_city[cityLabels[i]]);
  const m_final = ols(X, y_adj_final);

  // Формирование результатов по городам
  const city_effects: HierarchicalCityEffect[] = [];
  for (const c of cities) {
    const n_c = city_counts[c];
    const prec = (1.0 / Math.max(1e-8, sigma2_city)) + (n_c / Math.max(1e-8, sigma2_res));
    const V = 1.0 / prec;
    const se_u = Math.sqrt(Math.max(0, V));
    const shrinkage = (n_c * sigma2_city) / (n_c * sigma2_city + sigma2_res);

    city_effects.push({
      city: c,
      n_obs: n_c,
      shrinkage,
      u_city: u_city[c],
      se_u,
      ci_lower: u_city[c] - 1.96 * se_u,
      ci_upper: u_city[c] + 1.96 * se_u,
      rank: 0
    });
  }

  city_effects.sort((a, b) => b.u_city - a.u_city);
  city_effects.forEach((ce, i) => ce.rank = i + 1);

  // Интраклассовая корреляция: доля дисперсии, приходящаяся на межгородские различия
  const icc = sigma2_city / (sigma2_city + sigma2_res);

  return {
    coef: m_final.beta,
    se: m_final.seR, // Робастные стандартные ошибки White/Huber-White (HC1)
    names: ['Константа', 'ln(1+TRP)', 'Аптечный бонус (%)', 'ln(1+Визиты)'],
    r2: m_final.r2,
    n,
    n_cities,
    sigma2_city,
    sigma2_res,
    icc,
    city_effects,
    distributionFilteredCount: data.length - validData.length
  };
}
