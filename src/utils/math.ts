/**
 * Математические утилиты, линейная алгебра и статистические тесты PharmaMix Lab
 */

import { OLSResult } from '../types/pharma';

export const SEP = '\u0001';
export const PAL = ['#2854e6', '#0d9488', '#d97706', '#7c3aed', '#c52233', '#16845b', '#db2777', '#475569'];

/* ============ Форматирование ============ */
export const fmt = (n: number, d = 0): string =>
  Number.isFinite(n) ? new Intl.NumberFormat('ru-RU', { maximumFractionDigits: d, minimumFractionDigits: d }).format(n) : '—';

export const rub = (n: number): string =>
  Number.isFinite(n) ? (n < 0 ? '−' : '') + fmt(Math.abs(n), 0) + ' ₽' : '—';

export const pct = (n: number, d = 1): string =>
  Number.isFinite(n) ? (n < 0 ? '−' : '') + fmt(Math.abs(n) * 100, d) + '%' : '—';

export const sg = (n: number, d = 1): string => {
  const r = Math.round(n * 100 * Math.pow(10, d)) / Math.pow(10, d);
  return r > 0 ? '+' : r < 0 ? '−' : '';
};

export const sgnPct = (n: number, d = 1): string =>
  Number.isFinite(n) ? sg(n, d) + fmt(Math.abs(n) * 100, d) + '%' : '—';

export const pp = (n: number, d = 1): string =>
  Number.isFinite(n) ? sg(n, d) + fmt(Math.abs(n) * 100, d) + ' п.п.' : '—';

export const esc = (s: any): string =>
  String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));

export const short = (n: number): string =>
  Math.abs(n) >= 1e9 ? (n / 1e9).toFixed(1) + 'B' :
  Math.abs(n) >= 1e6 ? (n / 1e6).toFixed(1) + 'M' :
  Math.abs(n) >= 1e3 ? (n / 1e3).toFixed(0) + 'k' :
  (Math.abs(n) < 10 && n % 1 ? n.toFixed(2) : n.toFixed(0));

export const tone = (v: number): string =>
  Number.isFinite(v) ? (v > 0 ? 'pos' : v < 0 ? 'neg' : '') : '';

/* ============ Базовые операции с массивами ============ */
export const sum = (a: any[], f?: any): number => {
  let s = 0;
  for (const x of a) {
    const v = f === undefined ? x : typeof f === 'function' ? f(x) : x[f];
    if (Number.isFinite(v)) s += v;
  }
  return s;
};

export const avg = (a: number[]): number =>
  a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN;

export const uniq = (a: any[]): string[] =>
  [...new Set((a || []).map(x => String(x ?? '')))];

/**
 * Отладочная обертка для .map(), помогающая найти источник "undefined.map"
 */
export function traceMap<T, U>(arr: T[] | undefined | null, name: string, cb: (val: T, idx: number, array: T[]) => U): U[] {
  if (!arr || !Array.isArray(arr)) {
    console.warn(`[DIAGNOSTIC] .map() called on ${arr === null ? 'null' : typeof arr} for variable: "${name}"`);
    // В продакшн-режиме просто возвращаем пустой массив, чтобы не ронять UI
    return [];
  }
  return arr.map(cb);
}

export const mIdx = (m: string): number => {
  const [y, mo] = m.split('-').map(Number);
  return y * 12 + mo - 1;
};

export const mAdd = (m: string, k: number): string => {
  const d = mIdx(m) + k;
  return Math.floor(d / 12) + '-' + String(d % 12 + 1).padStart(2, '0');
};

export const tolEq = (a: number, b: number): boolean =>
  Math.abs(a - b) <= Math.max(0.01, 1e-9 * Math.max(Math.abs(a), Math.abs(b)));

export const corr = (a: number[], b: number[]): number => {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const ma = avg(a), mb = avg(b);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = a[i] - ma, dy = b[i] - mb;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  const den = Math.sqrt(sxx * syy);
  return den > 1e-12 ? sxy / den : 0;
};

/* ============ Специальные функции распределения ============ */
export function lgam(x: number): number {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, .1208650973866179e-2, -.5395239384953e-5];
  let y = x, t = x + 5.5;
  t -= (x + .5) * Math.log(t);
  let s = 1.000000000190015;
  for (let j = 0; j < 6; j++) s += c[j] / ++y;
  return -t + Math.log(2.5066282746310005 * s / x);
}

export function betacf(a: number, b: number, x: number): number {
  const FP = 1e-300;
  let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap;
  if (Math.abs(d) < FP) d = FP;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FP) d = FP;
    c = 1 + aa / c;
    if (Math.abs(c) < FP) c = FP;
    d = 1 / d;
    h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FP) d = FP;
    c = 1 + aa / c;
    if (Math.abs(c) < FP) c = FP;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 3e-14) break;
  }
  return h;
}

export function ibeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(lgam(a + b) - lgam(a) - lgam(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b;
}

export const tP2 = (t: number, df: number): number =>
  ibeta(df / (df + t * t), df / 2, .5);

export const fP = (F: number, d1: number, d2: number): number =>
  F <= 0 ? 1 : ibeta(d2 / (d2 + d1 * F), d2 / 2, d1 / 2);

export function tInv(df: number, alpha = .05): number {
  let lo = 0, hi = 60;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (tP2(mid, df) > alpha) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/* ============ Линейная алгебра и OLS ============ */
export function invMat(A: number[][]): number[][] | null {
  const n = A.length, M = A.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => i === j ? 1 : 0)]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-14) return null;
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c];
    for (let j = 0; j < 2 * n; j++) M[c][j] /= d;
    for (let r = 0; r < n; r++) if (r !== c) {
      const f = M[r][c];
      if (f) for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[c][j];
    }
  }
  return M.map(r => r.slice(n));
}

export function ols(X: number[][], y: number[]): OLSResult {
  const n = X.length, k = X[0].length;
  if (n <= k) throw Error('Наблюдений (' + n + ') не больше числа параметров (' + k + ').');
  const sc = Array(k).fill(1);
  for (let j = 0; j < k; j++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += X[i][j] * X[i][j];
    s = Math.sqrt(s / n);
    sc[j] = s > 1e-12 ? s : 1;
  }
  const Z = X.map(r => r.map((v, j) => v / sc[j]));
  const A = Array.from({ length: k }, () => Array(k).fill(0)), b = Array(k).fill(0);
  for (let i = 0; i < n; i++) {
    const z = Z[i];
    for (let j = 0; j < k; j++) {
      b[j] += z[j] * y[i];
      for (let l = j; l < k; l++) A[j][l] += z[j] * z[l];
    }
  }
  for (let j = 0; j < k; j++) {
    for (let l = 0; l < j; l++) A[j][l] = A[l][j];
    A[j][j] += 1e-10 * n;
  }
  const Ai = invMat(A);
  if (!Ai) throw Error('Матрица плана вырождена.');
  const bs = Ai.map(r => r.reduce((s, v, j) => s + v * b[j], 0));
  const beta = bs.map((v, j) => v / sc[j]);
  const fit = Z.map(z => z.reduce((s, v, j) => s + v * bs[j], 0));
  const res = y.map((v, i) => v - fit[i]), ssr = res.reduce((s, e) => s + e * e, 0);
  const df = n - k, s2 = ssr / df, my = avg(y), sst = y.reduce((s, v) => s + (v - my) ** 2, 0);
  const se = Ai.map((r, j) => Math.sqrt(Math.max(0, s2 * r[j])) / sc[j]);
  const meat = Array.from({ length: k }, () => Array(k).fill(0));
  for (let i = 0; i < n; i++) {
    const e2 = res[i] * res[i], z = Z[i];
    for (let j = 0; j < k; j++) for (let l = j; l < k; l++) meat[j][l] += e2 * z[j] * z[l];
  }
  for (let j = 0; j < k; j++) for (let l = 0; l < j; l++) meat[j][l] = meat[l][j];
  const T = Ai.map(r => meat[0].map((_, l) => r.reduce((s, v, m) => s + v * meat[m][l], 0)));
  const seR = Ai.map((r, j) => {
    let v = 0;
    for (let m = 0; m < k; m++) v += T[j][m] * Ai[m][j];
    return Math.sqrt(Math.max(0, v * n / df)) / sc[j];
  });
  const t = beta.map((v, j) => v / se[j]), p = t.map(v => tP2(v, df));
  const tR = beta.map((v, j) => v / seR[j]), pR = tR.map(v => tP2(v, df));
  const tc = tInv(df), r2 = sst > 0 ? 1 - ssr / sst : NaN;
  const F = k > 1 && sst > ssr ? ((sst - ssr) / (k - 1)) / s2 : NaN;
  return {
    n, k, beta, se, seR, t, p, pR,
    ci: beta.map((v, j) => [v - tc * se[j], v + tc * se[j]]),
    res, fit, ssr, df, sigma: Math.sqrt(s2),
    r2, adjR2: 1 - (1 - r2) * (n - 1) / df,
    F, pF: Number.isFinite(F) ? fP(F, k - 1, df) : NaN
  };
}

export function durbinWatson(rows: any[], res: number[]): number {
  const idx = rows.map((_, i) => i).sort((a, b) => rows[a].brand.localeCompare(rows[b].brand) || rows[a].month.localeCompare(rows[b].month));
  let num = 0, den = 0;
  for (let t = 0; t < idx.length; t++) {
    den += res[idx[t]] ** 2;
    if (t > 0 && rows[idx[t]].brand === rows[idx[t - 1]].brand && mIdx(rows[idx[t]].month) - mIdx(rows[idx[t - 1]].month) === 1) {
      num += (res[idx[t]] - res[idx[t - 1]]) ** 2;
    }
  }
  return den ? num / den : NaN;
}

export function jarqueBera(res: number[]): { S: number; K: number; jb: number; p: number } {
  const n = res.length, mu = avg(res), m2 = res.reduce((s, e) => s + (e - mu) ** 2, 0) / n;
  const m3 = res.reduce((s, e) => s + (e - mu) ** 3, 0) / n, m4 = res.reduce((s, e) => s + (e - mu) ** 4, 0) / n;
  const S_ = m3 / Math.pow(m2, 1.5), K = m4 / (m2 * m2), jb = n / 6 * (S_ * S_ + (K - 3) ** 2 / 4);
  return { S: S_, K, jb, p: Math.exp(-jb / 2) };
}

export function expectedImprovement(mean: number, std: number, f_best: number, xi = 0.01): number {
  if (std < 1e-8) return 0;
  const Z = (mean - f_best - xi) / std;
  const erf = (x: number) => {
    const p = 0.3275911;
    const a = [0.254829592, -0.284496736, 1.421413741, -1.453152027, 1.061405429];
    const sign = x < 0 ? -1 : 1;
    const absx = Math.abs(x);
    const t = 1.0 / (1.0 + p * absx);
    const y = 1.0 - (((((a[4] * t + a[3]) * t + a[2]) * t + a[1]) * t + a[0]) * t * Math.exp(-absx * absx));
    return sign * y;
  };
  const phi = 0.5 * (1 + erf(Z / Math.sqrt(2)));
  const pdf = (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * Z * Z);
  return Math.max(0, (mean - f_best - xi) * phi + std * pdf);
}
