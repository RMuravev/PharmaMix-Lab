/** Hill saturation for non-negative marketing exposure; independent per driver. */
export interface HillSetting { halfSaturation: number; slope: number }
export function hillSaturation(value: number, setting: HillSetting): number {
  const { halfSaturation, slope } = setting;
  if (!Number.isFinite(value) || value < 0 || !Number.isFinite(halfSaturation) || halfSaturation <= 0 || !Number.isFinite(slope) || slope <= 0) {
    throw new Error('Hill требует неотрицательного конечного воздействия, положительных EC50 и slope.');
  }
  if (value === 0) return 0;
  // Numerically stable logistic formulation of x^s / (x^s + EC50^s).
  const z = slope * (Math.log(value) - Math.log(halfSaturation));
  return z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z));
}

export interface HillSearchCandidate { setting: HillSetting; score: number }
/** Deterministic selection from scores produced by an *external train-only temporal CV*.
 * This function never sees test labels; the caller owns fold isolation and leakage controls.
 */
export function selectHillByCv(candidates: HillSearchCandidate[]): HillSearchCandidate {
  if (!candidates.length || candidates.some(c => !Number.isFinite(c.score) || c.score < 0 || !Number.isFinite(c.setting.halfSaturation) || c.setting.halfSaturation <= 0 || !Number.isFinite(c.setting.slope) || c.setting.slope <= 0)) {
    throw new Error('Некорректные кандидаты Hill/CV.');
  }
  return [...candidates].sort((a,b) => a.score-b.score || a.setting.halfSaturation-b.setting.halfSaturation || a.setting.slope-b.setting.slope)[0];
}
