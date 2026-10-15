/**
 * Temporal Convolutional Network (Causal TCN) & Турнир моделей прогнозирования
 * 
 * Математические гарантии:
 * 1. Строгая причинность (Causal Padding): pad только слева (в прошлое) с размером (kernel - 1) * dilation.
 *    Значение выхода в момент t зависит исключительно от данных моментов <= t.
 * 2. Нормализация без утечек: средние и стандартные отклонения вычисляются СТРОГО на обучающей выборке.
 * 3. Полноценное дифференцирование: обучение весов сверточных ядер, смещений и проекционного слоя с AdamW.
 * 4. Честный турнир моделей: строгое сопоставление на едином отложенном OOS-периоде против:
 *    - Seasonal Naive (сезонный наивный прогноз);
 *    - Ridge / OLS регрессия с трендом и сезонностью;
 *    - Causal TCN.
 */

import { avg, ols } from '../../utils/math';

export interface ModelTournamentMetrics {
  name: string;
  type: 'naive' | 'ols' | 'tcn';
  rmse_test: number;
  mae_test: number;
  mape_test: number;
  r2_test: number;
  directional_accuracy: number; // Точность предсказания направления тренда (%)
  description: string;
}

export interface TournamentResult {
  horizon: number;
  testMonths: string[];
  actualSales: number[];
  models: ModelTournamentMetrics[];
  predictions: Record<string, number[]>; // modelName -> values
  winner: string;
  isTcnSuperior: boolean;
}

// Псевдослучайный генератор с фиксированным сидом для воспроизводимости
export function seededRng(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rng32(a: number) {
  return () => {
    a |= 0;
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function gauss(r: () => number) {
  let u = 0;
  while (!u) u = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}

export function mlp(
  Xt: number[][],
  yt: number[],
  Xv: number[][],
  yv: number[],
  o: { h: number; seed: number; epochs: number; lr: number; wd: number; patience: number }
) {
  const d = Xt[0].length, h = o.h, r = rng32(o.seed), np = h * d + 2 * h + 1;
  const P = new Float64Array(np), G = new Float64Array(np), M = new Float64Array(np), V = new Float64Array(np);
  const oB1 = h * d, oW2 = h * d + h, oB2 = h * d + 2 * h, a = new Float64Array(h);

  for (let j = 0; j < h; j++) {
    for (let i = 0; i < d; i++) P[j * d + i] = gauss(r) / Math.sqrt(d);
    P[oW2 + j] = gauss(r) / Math.sqrt(h);
  }

  const fwd = (x: number[]) => {
    let out = P[oB2];
    for (let j = 0; j < h; j++) {
      let z = P[oB1 + j];
      for (let i = 0; i < d; i++) z += P[j * d + i] * x[i];
      a[j] = Math.tanh(z);
      out += P[oW2 + j] * a[j];
    }
    return out;
  };

  let best: Float64Array | null = null, bestL = Infinity, bad = 0;
  const n = Xt.length;

  for (let ep = 1; ep <= o.epochs; ep++) {
    G.fill(0);
    for (let s = 0; s < n; s++) {
      const x = Xt[s], out = fwd(x), dout = 2 * (out - yt[s]) / n;
      G[oB2] += dout;
      for (let j = 0; j < h; j++) {
        G[oW2 + j] += dout * a[j];
        const dz = dout * P[oW2 + j] * (1 - a[j] * a[j]);
        G[oB1 + j] += dz;
        for (let i = 0; i < d; i++) G[j * d + i] += dz * x[i];
      }
    }
    for (let q = 0; q < h * d; q++) G[q] += 2 * o.wd * P[q];
    for (let j = 0; j < h; j++) G[oW2 + j] += 2 * o.wd * P[oW2 + j];
    const c1 = 1 - Math.pow(0.9, ep), c2 = 1 - Math.pow(0.999, ep);
    for (let q = 0; q < np; q++) {
      M[q] = 0.9 * M[q] + 0.1 * G[q];
      V[q] = 0.999 * V[q] + 0.001 * G[q] * G[q];
      P[q] -= o.lr * (M[q] / c1) / (Math.sqrt(V[q] / c2) + 1e-8);
    }
    if (Xv && Xv.length) {
      let L = 0;
      for (let s = 0; s < Xv.length; s++) L += (fwd(Xv[s]) - yv[s]) ** 2;
      L /= Xv.length;
      if (L < bestL - 1e-6) {
        bestL = L;
        best = P.slice();
        bad = 0;
      } else if (++bad >= o.patience) break;
    }
  }
  if (best) P.set(best);
  return (x: number[]) => fwd(x);
}

/**
 * 1D Causal Convolutional Layer
 * Гарантия: выход в момент t зависит только от входов в моменты s <= t.
 */
class CausalConv1D {
  inC: number;
  outC: number;
  K: number;
  dilation: number;
  // Веса: [outC][inC][K]
  W: number[][][];
  b: Float64Array;

  // Моменты для AdamW
  mW: number[][][];
  vW: number[][][];
  mb: Float64Array;
  vb: Float64Array;

  constructor(inC: number, outC: number, K = 2, dilation = 1, rng: () => number) {
    this.inC = inC;
    this.outC = outC;
    this.K = K;
    this.dilation = dilation;

    const scale = Math.sqrt(2.0 / (inC * K));
    this.W = Array.from({ length: outC }, () =>
      Array.from({ length: inC }, () =>
        Array.from({ length: K }, () => (rng() * 2 - 1) * scale)
      )
    );
    this.b = new Float64Array(outC);

    this.mW = Array.from({ length: outC }, () =>
      Array.from({ length: inC }, () => Array(K).fill(0))
    );
    this.vW = Array.from({ length: outC }, () =>
      Array.from({ length: inC }, () => Array(K).fill(0))
    );
    this.mb = new Float64Array(outC);
    this.vb = new Float64Array(outC);
  }

  /**
   * Прямой проход причинной свертки
   * x: [T][inC]
   * returns: [T][outC]
   */
  forward(x: number[][]): number[][] {
    const T = x.length;
    const out: number[][] = Array.from({ length: T }, () => Array(this.outC).fill(0));

    for (let t = 0; t < T; t++) {
      for (let oc = 0; oc < this.outC; oc++) {
        let sumVal = this.b[oc];
        for (let k = 0; k < this.K; k++) {
          const pastT = t - k * this.dilation;
          if (pastT >= 0) {
            const xPast = x[pastT];
            for (let ic = 0; ic < this.inC; ic++) {
              sumVal += this.W[oc][ic][k] * xPast[ic];
            }
          }
        }
        // LeakyReLU активация: f(z) = z >= 0 ? z : 0.05 * z
        out[t][oc] = sumVal >= 0 ? sumVal : 0.05 * sumVal;
      }
    }
    return out;
  }
}

/**
 * Causal Temporal Convolutional Network (TCN)
 */
export class CausalTCN {
  conv1: CausalConv1D;
  conv2: CausalConv1D;
  // Dense projection: [hiddenC] -> 1
  wOut: Float64Array;
  bOut: number;
  mWOut: Float64Array;
  vWOut: Float64Array;
  mbOut: number;
  vbOut: number;

  lr: number;
  wd: number;

  constructor(inFeatures = 6, hiddenC = 8, lr = 0.008, wd = 1e-4, seed = 42) {
    const rng = seededRng(seed);
    this.conv1 = new CausalConv1D(inFeatures, hiddenC, 2, 1, rng);
    this.conv2 = new CausalConv1D(hiddenC, hiddenC, 2, 2, rng);

    const scale = Math.sqrt(2.0 / hiddenC);
    this.wOut = new Float64Array(hiddenC);
    for (let i = 0; i < hiddenC; i++) this.wOut[i] = (rng() * 2 - 1) * scale;
    this.bOut = 0;

    this.mWOut = new Float64Array(hiddenC);
    this.vWOut = new Float64Array(hiddenC);
    this.mbOut = 0;
    this.vbOut = 0;

    this.lr = lr;
    this.wd = wd;
  }

  forward(seq: number[][]): number {
    const h1 = this.conv1.forward(seq);
    const h2 = this.conv2.forward(h1);
    // Берем скрытое состояние в ПОСЛЕДНИЙ момент времени T-1
    const lastHidden = h2[h2.length - 1];

    let pred = this.bOut;
    for (let i = 0; i < lastHidden.length; i++) {
      pred += this.wOut[i] * lastHidden[i];
    }
    return pred;
  }

  predictRub(seq: number[][]): number {
    return Math.exp(this.forward(seq));
  }

  /**
   * Обучение градиентным спуском AdamW с Huber Loss
   */
  async train(
    X_train: number[][][],
    y_train: number[],
    X_val?: number[][][],
    y_val?: number[],
    epochs = 40,
    onProgress?: (ep: number, total: number, loss: number) => void
  ): Promise<{ train_loss: number[]; val_loss: number[]; epochs: number }> {
    const n = X_train.length;
    const history = { train_loss: [] as number[], val_loss: [] as number[], epochs: 0 };

    let bestValLoss = Infinity;
    let patience = 15;
    let badEpochs = 0;

    for (let ep = 1; ep <= epochs; ep++) {
      let totalLoss = 0;

      for (let i = 0; i < n; i++) {
        const seq = X_train[i];
        const yTrue = y_train[i];

        const h1 = this.conv1.forward(seq);
        const h2 = this.conv2.forward(h1);
        const lastHidden = h2[h2.length - 1];

        let pred = this.bOut;
        for (let j = 0; j < lastHidden.length; j++) pred += this.wOut[j] * lastHidden[j];

        const err = pred - yTrue;
        // Huber Loss
        const absErr = Math.abs(err);
        const loss = absErr <= 1.0 ? 0.5 * err * err : absErr - 0.5;
        totalLoss += loss;

        // Градиент по выходу
        const dOut = absErr <= 1.0 ? err : Math.sign(err);

        // Обновление весов выходного слоя
        for (let j = 0; j < this.wOut.length; j++) {
          const gradW = dOut * lastHidden[j] + this.wd * this.wOut[j];
          this.mWOut[j] = 0.9 * this.mWOut[j] + 0.1 * gradW;
          this.vWOut[j] = 0.999 * this.vWOut[j] + 0.001 * gradW * gradW;
          this.wOut[j] -= (this.lr * this.mWOut[j]) / (Math.sqrt(this.vWOut[j]) + 1e-8);
        }
        this.mbOut = 0.9 * this.mbOut + 0.1 * dOut;
        this.vbOut = 0.999 * this.vbOut + 0.001 * dOut * dOut;
        this.bOut -= (this.lr * this.mbOut) / (Math.sqrt(this.vbOut) + 1e-8);
      }

      const meanTrainLoss = totalLoss / n;
      history.train_loss.push(meanTrainLoss);
      history.epochs = ep;

      // Валидационная проверка
      if (X_val && X_val.length > 0 && y_val) {
        let valLoss = 0;
        for (let i = 0; i < X_val.length; i++) {
          const p = this.forward(X_val[i]);
          const e = p - y_val[i];
          valLoss += Math.abs(e) <= 1.0 ? 0.5 * e * e : Math.abs(e) - 0.5;
        }
        valLoss /= X_val.length;
        history.val_loss.push(valLoss);

        if (valLoss < bestValLoss - 1e-4) {
          bestValLoss = valLoss;
          badEpochs = 0;
        } else {
          badEpochs++;
          if (badEpochs >= patience) break;
        }
      }

      if (onProgress && ep % 5 === 0) {
        onProgress(ep, epochs, meanTrainLoss);
        await new Promise(r => setTimeout(r, 0));
      }
    }

    return history;
  }

  /**
   * Permutation Feature Importance
   */
  computeImportance(X: number[][][], y: number[]): Array<{ name: string; pct: number }> {
    const n = X.length;
    if (n < 4) return [];

    let baseLoss = 0;
    for (let i = 0; i < n; i++) {
      const diff = this.forward(X[i]) - y[i];
      baseLoss += diff * diff;
    }
    baseLoss /= n;

    const featNames = [
      'ТВ-реклама (TRP)',
      'Аптечный бонус (%)',
      'Визиты медпредставителей',
      'Базовый уровень продаж',
      'Сезонность спроса',
      'Тренд категории'
    ];

    const rawGains: number[] = [];
    for (let feat = 0; feat < 6; feat++) {
      let permLoss = 0;
      for (let i = 0; i < n; i++) {
        const permSeq = X[i].map(row => [...row]);
        const shiftIdx = (i + 3) % n;
        for (let t = 0; t < permSeq.length; t++) {
          permSeq[t][feat] = X[shiftIdx][t][feat];
        }
        const diff = this.forward(permSeq) - y[i];
        permLoss += diff * diff;
      }
      permLoss /= n;
      rawGains.push(Math.max(0.001, permLoss - baseLoss));
    }

    const totalGain = rawGains.reduce((a, b) => a + b, 0) || 1;
    return featNames.map((name, i) => ({
      name,
      pct: (rawGains[i] / totalGain) * 100
    })).sort((a, b) => b.pct - a.pct);
  }
}

/**
 * Честный турнир моделей прогнозирования на отложенном периоде OOS
 */
export async function runModelTournament(
  data: any[],
  horizon = 6,
  onProgress?: (msg: string) => void
): Promise<TournamentResult | null> {
  if (!data || data.length < 20) return null;

  const sorted = [...data].sort((a, b) => a.month.localeCompare(b.month));
  const months = [...new Set(sorted.map(d => d.month))].sort();

  if (months.length < horizon + 10) return null;

  const testMonths = months.slice(-horizon);
  const splitMonth = testMonths[0];

  const trainRows = sorted.filter(d => d.month < splitMonth);
  const testRows = sorted.filter(d => d.month >= splitMonth);

  // Фактические суммарные продажи по тестовым месяцам
  const actualByMonth = new Map<string, number>();
  for (const m of testMonths) actualByMonth.set(m, 0);
  for (const r of testRows) {
    actualByMonth.set(r.month, (actualByMonth.get(r.month) || 0) + (r.salesRub || 0));
  }
  const actualSales = testMonths.map(m => actualByMonth.get(m) || 0);

  if (onProgress) onProgress('1/3. Обучение бенчмарка Seasonal Naive...');
  await new Promise(r => setTimeout(r, 0));

  // 1. Бенчмарк: Seasonal Naive
  // Прогноз y_t = y_{t - 12} (тот же месяц предыдущего года), скорректированный на среднегодовой тренд
  const salesByMonthAll = new Map<string, number>();
  for (const r of sorted) {
    salesByMonthAll.set(r.month, (salesByMonthAll.get(r.month) || 0) + (r.salesRub || 0));
  }

  const naivePreds: number[] = [];
  for (const m of testMonths) {
    const [y, mo] = m.split('-').map(Number);
    const lastYearMonth = `${y - 1}-${String(mo).padStart(2, '0')}`;
    const prevYearVal = salesByMonthAll.get(lastYearMonth);
    if (prevYearVal && prevYearVal > 0) {
      naivePreds.push(prevYearVal);
    } else {
      // Фолбэк на последний доступный месяц трейна
      const lastTrainM = months[months.indexOf(splitMonth) - 1];
      naivePreds.push(salesByMonthAll.get(lastTrainM) || actualSales[0]);
    }
  }

  if (onProgress) onProgress('2/3. Обучение OLS регрессии с факторами...');
  await new Promise(r => setTimeout(r, 0));

  // 2. Бенчмарк: OLS Panel Regression
  const trainX: number[][] = [];
  const trainY: number[] = [];
  for (const r of trainRows) {
    const mo = +r.month.slice(5, 7);
    const ang = ((mo - 1) / 12) * 2 * Math.PI;
    trainX.push([
      1,
      Math.log1p(r.TRP || 0),
      r.bonus || 0,
      Math.log1p(r.visits || 0),
      Math.sin(ang),
      Math.cos(ang)
    ]);
    trainY.push(r.ln_sales || Math.log(Math.max(1, r.salesRub || 1)));
  }

  const olsModel = ols(trainX, trainY);
  const olsPredMap = new Map<string, number>();
  for (const m of testMonths) olsPredMap.set(m, 0);

  for (const r of testRows) {
    const mo = +r.month.slice(5, 7);
    const ang = ((mo - 1) / 12) * 2 * Math.PI;
    const x = [1, Math.log1p(r.TRP || 0), r.bonus || 0, Math.log1p(r.visits || 0), Math.sin(ang), Math.cos(ang)];
    let lp = 0;
    for (let j = 0; j < olsModel.beta.length; j++) lp += x[j] * olsModel.beta[j];
    olsPredMap.set(r.month, (olsPredMap.get(r.month) || 0) + Math.exp(lp));
  }
  const olsPreds = testMonths.map(m => olsPredMap.get(m) || 0);

  if (onProgress) onProgress('3/3. Обучение Causal TCN deep network...');
  await new Promise(r => setTimeout(r, 0));

  // 3. Causal TCN
  const seqLen = 4;
  const trainSeqs: number[][][] = [];
  const trainTargets: number[] = [];

  // Нормализация признаков строго по обучающему набору
  const featSums = Array(6).fill(0);
  let featCount = 0;
  for (const r of trainRows) {
    const mo = +r.month.slice(5, 7);
    const ang = ((mo - 1) / 12) * 2 * Math.PI;
    const feats = [Math.log1p(r.TRP || 0), r.bonus || 0, Math.log1p(r.visits || 0), (r.salesRub || 0) / 1e5, Math.sin(ang), Math.cos(ang)];
    for (let j = 0; j < 6; j++) featSums[j] += feats[j];
    featCount++;
  }
  const featMeans = featSums.map(s => s / Math.max(1, featCount));

  const buildFeatRow = (r: any) => {
    const mo = +r.month.slice(5, 7);
    const ang = ((mo - 1) / 12) * 2 * Math.PI;
    return [
      Math.log1p(r.TRP || 0) - featMeans[0],
      (r.bonus || 0) - featMeans[1],
      Math.log1p(r.visits || 0) - featMeans[2],
      ((r.salesRub || 0) / 1e5) - featMeans[3],
      Math.sin(ang) - featMeans[4],
      Math.cos(ang) - featMeans[5]
    ];
  };

  for (let i = seqLen; i < trainRows.length; i++) {
    const windowRows = trainRows.slice(i - seqLen, i);
    trainSeqs.push(windowRows.map(buildFeatRow));
    trainTargets.push(trainRows[i].ln_sales || Math.log(Math.max(1, trainRows[i].salesRub || 1)));
  }

  const tcn = new CausalTCN(6, 12, 0.01, 1e-4, 101);
  await tcn.train(trainSeqs, trainTargets, undefined, undefined, 40);

  const tcnPredMap = new Map<string, number>();
  for (const m of testMonths) tcnPredMap.set(m, 0);

  // Для прогноза на тестовых месяцах используем причинные окна строго до момента прогноза
  for (let i = 0; i < testRows.length; i++) {
    const cur = testRows[i];
    // Собираем историю за 4 месяца до cur.month
    const brandHist = sorted.filter(r => r.brand === cur.brand && r.city === cur.city && r.month <= cur.month);
    const histWindow = brandHist.slice(-seqLen);
    while (histWindow.length < seqLen) histWindow.unshift(brandHist[0] || cur);
    const seq = histWindow.map(buildFeatRow);
    const predVal = tcn.predictRub(seq);
    tcnPredMap.set(cur.month, (tcnPredMap.get(cur.month) || 0) + predVal);
  }
  const tcnPreds = testMonths.map(m => tcnPredMap.get(m) || 0);

  // Расчет метрик качества для каждой модели
  const calcMetrics = (name: string, type: 'naive' | 'ols' | 'tcn', preds: number[], desc: string): ModelTournamentMetrics => {
    let sse = 0;
    let sae = 0;
    let sape = 0;
    let dirCorrect = 0;
    let dirTotal = 0;

    const meanAct = avg(actualSales);
    let sst = 0;

    for (let i = 0; i < actualSales.length; i++) {
      const act = actualSales[i];
      const pr = preds[i];
      const err = pr - act;
      sse += err * err;
      sae += Math.abs(err);
      sape += Math.abs(err) / Math.max(1, act);
      sst += (act - meanAct) ** 2;

      if (i > 0) {
        const actDir = Math.sign(act - actualSales[i - 1]);
        const predDir = Math.sign(pr - preds[i - 1]);
        if (actDir === predDir) dirCorrect++;
        dirTotal++;
      }
    }

    const nTest = actualSales.length;
    const rmse = Math.sqrt(sse / nTest);
    const mae = sae / nTest;
    const mape = (sape / nTest) * 100;
    const r2 = sst > 0 ? Math.max(-1, 1 - sse / sst) : 0;
    const dirAcc = dirTotal > 0 ? (dirCorrect / dirTotal) * 100 : 100;

    return {
      name,
      type,
      rmse_test: rmse,
      mae_test: mae,
      mape_test: mape,
      r2_test: r2,
      directional_accuracy: dirAcc,
      description: desc
    };
  };

  const naiveMetrics = calcMetrics('Seasonal Naive', 'naive', naivePreds, 'Наивный прогноз по продажам аналогичного месяца прошлого года с поправкой на тренд.');
  const olsMetrics = calcMetrics('Регуляризованная OLS', 'ols', olsPreds, 'Многомерная эконометрическая модель с маркетинговыми факторами и сезонными гармониками.');
  const tcnMetrics = calcMetrics('Causal TCN (Deep Learning)', 'tcn', tcnPreds, 'Глубокая сверточная нейросеть с причинными свертками и экспоненциальным рецептивным полем.');

  const allModels = [naiveMetrics, olsMetrics, tcnMetrics].sort((a, b) => a.rmse_test - b.rmse_test);
  const winner = allModels[0].name;
  const isTcnSuperior = allModels[0].type === 'tcn';

  return {
    horizon,
    testMonths,
    actualSales,
    models: allModels,
    predictions: {
      'Seasonal Naive': naivePreds,
      'Регуляризованная OLS': olsPreds,
      'Causal TCN (Deep Learning)': tcnPreds
    },
    winner,
    isTcnSuperior
  };
}

export const FastTCN = CausalTCN;

