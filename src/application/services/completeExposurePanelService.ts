/** Complete, explicitly scoped unit-month panel for sales, visits and promo.
 * Business contract: absent records inside the declared universe are TRUE zeros.
 * No inference of coverage outside the explicit unit and calendar lists.
 */
export interface ExposurePanelInput {
  unitId: string;
  period: string;
  salesUnits?: number;
  salesRub?: number;
  weightedVisits?: number;
  promoBonusRub?: number;
  promoActive?: number;
}
export interface CompleteExposureRow {
  unitId: string; period: string; salesUnits: number; salesRub: number;
  weightedVisits: number; promoBonusRub: number; promoActive: number;
}
export interface CompleteExposurePanelResult {
  rows: CompleteExposureRow[];
  insertedZeroRows: number;
  filledZeroFields: number;
  warnings: string[];
}
const validMonth = (value: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
const numericFields = ['salesUnits', 'salesRub', 'weightedVisits', 'promoBonusRub', 'promoActive'] as const;
export function buildCompleteExposurePanel(
  inputs: ExposurePanelInput[],
  scope: { eligibleUnits: string[]; calendar: string[]; maxCells?: number },
): CompleteExposurePanelResult {
  const { eligibleUnits, calendar } = scope;
  if (!eligibleUnits.length || eligibleUnits.some(id => !id?.trim()) || new Set(eligibleUnits).size !== eligibleUnits.length)
    throw new Error('Укажите уникальные единицы наблюдения в охвате.');
  if (!calendar.length || calendar.some(p => !validMonth(p)) || new Set(calendar).size !== calendar.length)
    throw new Error('Укажите уникальные месяцы в охвате.');
  const maxCells = scope.maxCells ?? 1_000_000;
  if (!Number.isSafeInteger(maxCells) || maxCells <= 0 || eligibleUnits.length * calendar.length > maxCells)
    throw new Error('Размер панели превышает установленный лимит.');
  const units = new Set(eligibleUnits);
  const months = new Set(calendar);
  const observed = new Map<string, ExposurePanelInput>();
  let filledZeroFields = 0;
  const key = (unit: string, month: string) => JSON.stringify([unit, month]);
  for (const input of inputs) {
    if (!units.has(input.unitId) || !months.has(input.period))
      throw new Error('Входная запись за пределами заявленного охвата.');
    const id = key(input.unitId, input.period);
    if (observed.has(id)) throw new Error('Дубликат записи единица × месяц. Агрегируйте источники до построения панели.');
    for (const field of numericFields) {
      const value = input[field];
      if (value !== undefined && (!Number.isFinite(value) || value < 0))
        throw new Error(`Недопустимое значение ${field}: ожидается неотрицательное конечное число.`);
    }
    observed.set(id, input);
  }
  const rows: CompleteExposureRow[] = [];
  let insertedZeroRows = 0;
  for (const unitId of [...eligibleUnits].sort()) {
    for (const period of [...calendar].sort()) {
      const input = observed.get(key(unitId, period));
      if (!input) insertedZeroRows++;
      else filledZeroFields += numericFields.filter(field => input[field] === undefined).length;
      rows.push({ unitId, period,
        salesUnits: input?.salesUnits ?? 0,
        salesRub: input?.salesRub ?? 0,
        weightedVisits: input?.weightedVisits ?? 0,
        promoBonusRub: input?.promoBonusRub ?? 0,
        promoActive: input?.promoActive ?? 0,
      });
    }
  }
  return { rows, insertedZeroRows, filledZeroFields, warnings: [
    'Нули допустимы только внутри явно определённого охвата выгрузки.',
    'Визиты, промо и продажи должны быть предварительно приведены к единой единице наблюдения; не дублируйте воздействия при объединении SKU или сетей.',
    'Нулевое воздействие не делает контрольную группу автоматически сопоставимой; проверяйте предтренды и другие воздействия.',
  ] };
}
