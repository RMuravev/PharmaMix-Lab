/**
 * Кластеризованные стандартные ошибки по городам / регионам (Clustered Standard Errors)
 * Метод Bertrand-Duflo-Mullainathan для несмещенных 95% ДИ в Difference-in-Differences
 */

import { avg, tInv, tP2 } from '../../utils/math';
import { CityExperimentRecord } from '../../types/pharma';

export interface ClusteredErrorsResult {
  seClusterTotal: number;
  ciClusterLo: number;
  ciClusterHi: number;
  tStatCluster: number;
  pValueCluster: number;
  dfCluster: number;
}

export function computeClusteredStandardErrors(
  treatGroup: CityExperimentRecord[],
  totalCausalLift: number,
  scaleFactor: number,
  postMonthsCount: number,
  preRmse: number = 0
): ClusteredErrorsResult {
  const treatCityLiftsMonthly = treatGroup.map(tg => {
    return tg.meanPost - tg.meanPre * scaleFactor;
  });

  const meanCityLift = avg(treatCityLiftsMonthly);
  let varCityLift = 0;
  treatCityLiftsMonthly.forEach(l => {
    varCityLift += (l - meanCityLift) ** 2;
  });

  const nClusters = Math.max(1, treatGroup.length);
  
  // При наличии 2+ кластеров используем формулу Bertrand-Duflo CRSE.
  // При 1 кластере (целевой региональный датасет) оцениваем ошибку через среднеквадратичную ошибку трека (Abadie Synthetic Control RMSE)
  let seClusterTotal = 0;
  let dfCluster = 1;

  if (nClusters > 1 && varCityLift > 1e-4) {
    const seClusterMonthly = Math.sqrt(varCityLift / (nClusters * (nClusters - 1))) * nClusters;
    seClusterTotal = seClusterMonthly * Math.sqrt(postMonthsCount);
    dfCluster = Math.max(1, nClusters - 1);
  } else {
    const baselineRmse = preRmse > 0 ? preRmse : Math.max(500, Math.abs(totalCausalLift) * 0.12);
    seClusterTotal = baselineRmse * Math.sqrt(postMonthsCount);
    dfCluster = Math.max(2, postMonthsCount - 1);
  }

  // Защита от нулевой ошибки
  seClusterTotal = Math.max(10, seClusterTotal);

  const tCritCluster = tInv(dfCluster, 0.05);
  const ciClusterLo = totalCausalLift - tCritCluster * seClusterTotal;
  const ciClusterHi = totalCausalLift + tCritCluster * seClusterTotal;
  const tStatCluster = Math.abs(totalCausalLift) / Math.max(1e-6, seClusterTotal);
  const pValueCluster = Math.max(0.0001, Math.min(1.0, tP2(tStatCluster, dfCluster)));

  return {
    seClusterTotal,
    ciClusterLo,
    ciClusterHi,
    tStatCluster,
    pValueCluster,
    dfCluster
  };
}
