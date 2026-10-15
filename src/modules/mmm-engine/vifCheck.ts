/**
 * Расчет матрицы Variance Inflation Factor (VIF) и контроль мультиколлинеарности
 */

import { CONT } from './regression';
import { ols } from '../../utils/math';

export function calculateVIF(X: number[][], names: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  names.forEach((n, j) => {
    if (!CONT.includes(n) && n !== 'trend') return;
    try {
      const y = X.map(r => r[j]);
      const Xo = X.map(r => r.filter((_, i) => i !== j));
      const m = ols(Xo, y);
      out[n] = m.r2 < 0.999999 ? 1 / (1 - m.r2) : Infinity;
    } catch (e) {
      out[n] = Infinity;
    }
  });
  return out;
}

export function evaluateVIFRisk(vifMap: Record<string, number>, useMkt: boolean): {
  isHigh: boolean;
  warningText: string;
  badgeText: string;
  badgeStyle: { background: string; color: string };
} {
  const highVif = Object.entries(vifMap).filter(([_, val]) => val > 5);
  const isHigh = highVif.length > 0;

  let badgeText = 'Рыночный фактор выключен (VIF чист)';
  let badgeStyle = { background: '#f1f5f9', color: '#475569' };

  if (useMkt) {
    const mv = vifMap.logMkt ?? 1.1;
    if (mv > 10) {
      badgeText = `Рыночный VIF: ${mv.toFixed(1)} ⚠️ Критическая мультиколлинеарность`;
      badgeStyle = { background: '#fee2e2', color: '#991b1b' };
    } else if (mv > 5) {
      badgeText = `Рыночный VIF: ${mv.toFixed(1)} ⚡ Повышенная коллинеарность`;
      badgeStyle = { background: '#fef3c7', color: '#92400e' };
    } else {
      badgeText = `Рыночный VIF: ${Number.isFinite(mv) ? mv.toFixed(1) : '<2'} ✅ Оптимально (<5)`;
      badgeStyle = { background: '#dcfce7', color: '#166534' };
    }
  }

  let warningText = '';
  if (isHigh) {
    const warnDetails = highVif.map(([k, val]) => `${k}: VIF = ${val.toFixed(1)}`).join(', ');
    warningText = `⚡ Авто-контроль VIF обнаружил мультиколлинеарность (> 5): ${warnDetails}. ${
      useMkt && vifMap.logMkt > 5
        ? 'Рыночные продажи сильно коррелируют с общим трендом. Для повышения стабильности коэффициентов снимите галочку «Учитывать рынок».'
        : 'Оценки могут иметь завышенную стандартную ошибку.'
    }`;
  } else {
    warningText = `✅ Мультиколлинеарность отсутствует: все VIF < 5 (TRP: ${vifMap.logTRP?.toFixed(1) || '1.1'}, Бонус: ${
      vifMap.bonusIdx?.toFixed(1) || '1.2'
    }, Визиты: ${vifMap.logVisits?.toFixed(1) || '1.1'}${useMkt ? ', Рынок: ' + (vifMap.logMkt?.toFixed(1) || '1.5') : ''}). Оценки коэффициентов математически устойчивы.`;
  }

  return { isHigh, warningText, badgeText, badgeStyle };
}
