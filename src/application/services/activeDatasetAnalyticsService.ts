import type { ActiveDatasetSnapshot } from '../../infrastructure/indexeddb/activeDatasetSnapshotRepository';
import type { SourceAvailabilityMap } from '../contracts/sourceAvailability';

export interface DatasetAnalyticsSummary {
  projectId: string;
  datasetVersion: string | null;
  sourceRows: ActiveDatasetSnapshot['rowCounts'];
  salesRevenueRub: number;
  salesUnits: number;
  marketRevenueRub: number | null;
  marketUnits: number | null;
  tvTrp: number | null;
  weightedVisits: number | null;
  accruedBonusEstimateRub: number | null;
  promoRowsWithoutMatchingSales: number;
  sourceAvailability?: SourceAvailabilityMap;
  metricCoverage: Partial<Record<'market'|'promo'|'tv'|'visits',{status:'complete'|'partial'|'unavailable';coveredPeriods:string[]}>>;
  sourceWarnings: string[];
}

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const key = (period: string, chain: string, brand: string, sku: string) =>
  [period, chain.trim().toLocaleLowerCase(), brand.trim().toLocaleLowerCase(), sku.trim().toLocaleLowerCase()].join('\u001f');

/**
 * Derives cross-source dashboard metrics from one consistent active snapshot.
 * Promo investment is treated as an accrued sales bonus, not as a consumer discount.
 * The bonus estimate is calculated only when a matching chain/brand/SKU/period sales row exists.
 */
export class ActiveDatasetAnalyticsService {
  summarize(snapshot: ActiveDatasetSnapshot): DatasetAnalyticsSummary {
    const sales = snapshot.salesFacts;
    const market = snapshot.marketFacts;
    const promo = snapshot.promoFacts;
    const tv = snapshot.tvFacts;
    const visits = snapshot.visitFacts;

    const salesByKey = new Map<string, number>();
    for (const fact of sales) {
      const k = key(fact.period, fact.chain, fact.brand, fact.sku);
      salesByKey.set(k, (salesByKey.get(k) ?? 0) + fact.revenueRub);
    }

    let accruedBonusEstimateRub = 0;
    let promoRowsWithoutMatchingSales = 0;
    for (const fact of promo) {
      const revenue = salesByKey.get(key(fact.period, fact.chain, fact.brand, fact.sku));
      if (revenue === undefined) {
        promoRowsWithoutMatchingSales += 1;
        continue;
      }
      const rate = Number(fact.bonusRatePct);
      if (Number.isFinite(rate) && rate >= 0) accruedBonusEstimateRub += revenue * rate / 100;
    }

    const sourceWarnings: string[] = [];
    if (!sales.length) sourceWarnings.push('Нет фактов продаж: основные коммерческие KPI недоступны.');
    if (!market.length) sourceWarnings.push('Нет рыночных данных: сравнение с адресным рынком недоступно.');
    const promoUnavailable = snapshot.sourceAvailability?.promo.status === 'NOT_PROVIDED';
    if (promoUnavailable) sourceWarnings.push('Источник Promo не предоставлен: промо-воздействие и начисленный бонус недоступны, а не равны нулю.');
    else if (!promo.length) sourceWarnings.push('В объявленном охвате нет строк промо: промо-воздействие и начисленный бонус равны нулю.');
    const salesCoverage=snapshot.sourceAvailability?.sales.coverage?.periods??[],promoCoverage=snapshot.sourceAvailability?.promo.coverage?.periods??[];
    if(!promoUnavailable&&salesCoverage.some(period=>!promoCoverage.includes(period)))sourceWarnings.push('Promo coverage не охватывает все периоды Sales; итог промобонуса является частичным.');
    if (!tv.length) sourceWarnings.push('Нет данных TV TRP.');
    if (!visits.length) sourceWarnings.push('Нет данных визитов медицинских представителей.');
    if (promoRowsWithoutMatchingSales > 0) {
      sourceWarnings.push(`${promoRowsWithoutMatchingSales} строк промо не сопоставлены с продажами по периоду, сети, бренду и SKU.`);
    }

    return {
      projectId: snapshot.projectId,
      datasetVersion: snapshot.datasetVersion,
      sourceRows: { ...snapshot.rowCounts },
      salesRevenueRub: round2(sales.reduce((sum, row) => sum + (Number.isFinite(row.revenueRub) ? row.revenueRub : 0), 0)),
      salesUnits: round2(sales.reduce((sum, row) => sum + (Number.isFinite(row.units) ? row.units : 0), 0)),
      marketRevenueRub: snapshot.sourceAvailability?.market.status==='NOT_PROVIDED'?null:round2(market.reduce((sum, row) => sum + (Number.isFinite(row.revenueRub) ? row.revenueRub : 0), 0)),
      marketUnits: snapshot.sourceAvailability?.market.status==='NOT_PROVIDED'?null:round2(market.reduce((sum, row) => sum + (Number.isFinite(row.units) ? row.units : 0), 0)),
      tvTrp: snapshot.sourceAvailability?.tv.status==='NOT_PROVIDED'?null:round2(tv.reduce((sum, row) => sum + (Number.isFinite(row.trp) ? row.trp : 0), 0)),
      weightedVisits: snapshot.sourceAvailability?.visits.status==='NOT_PROVIDED'?null:round2(visits.reduce((sum, row) => sum + (Number.isFinite(row.weightedVisits) ? row.weightedVisits : 0), 0)),
      accruedBonusEstimateRub: promoUnavailable ? null : round2(accruedBonusEstimateRub),
      promoRowsWithoutMatchingSales,
      sourceAvailability: snapshot.sourceAvailability,
      metricCoverage:Object.fromEntries((['market','promo','tv','visits'] as const).map(source=>{const availability=snapshot.sourceAvailability?.[source],covered=availability?.coverage?.periods??[],status=availability?.status==='NOT_PROVIDED'?'unavailable':salesCoverage.length&&salesCoverage.some(period=>!covered.includes(period))?'partial':'complete';return[source,{status,coveredPeriods:covered}];})),
      sourceWarnings,
    };
  }
}
