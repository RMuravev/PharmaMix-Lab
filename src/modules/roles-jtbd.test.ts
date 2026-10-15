import { describe, it, expect } from 'vitest';
import { runAutoMLEngine } from './mmm-engine/automlEngine';
import { calculateVIF, evaluateVIFRisk } from './mmm-engine/vifCheck';
import { runBayesianBudgetOptimization } from './budget-optimizer/budgetOptimizer';
import { runDataQualityAudit } from './data-quality/qualityAuditor';
import { runGeoABDifferenceInDifferences } from './causal-inference/geoAbExperiment';

describe('JTBD & Main Roles Task Verification', () => {
  it('Role 1: Marketing Analytics Lead - AutoML Model Tournament & VIF', () => {
    const panel = [
      { brand: 'BrandA', region: 'Moscow', month: '2025-01', salesRub: 1000000, units: 10000, price: 100, digital: 50000, tv: 100000, pharm: 20000, reps: 30000 },
      { brand: 'BrandA', region: 'Moscow', month: '2025-02', salesRub: 1200000, units: 12000, price: 100, digital: 60000, tv: 120000, pharm: 25000, reps: 35000 },
      { brand: 'BrandA', region: 'Moscow', month: '2025-03', salesRub: 1100000, units: 11000, price: 100, digital: 55000, tv: 110000, pharm: 22000, reps: 32000 },
      { brand: 'BrandA', region: 'Moscow', month: '2025-04', salesRub: 1300000, units: 13000, price: 100, digital: 70000, tv: 140000, pharm: 30000, reps: 40000 },
      { brand: 'BrandA', region: 'Moscow', month: '2025-05', salesRub: 1400000, units: 14000, price: 100, digital: 75000, tv: 150000, pharm: 32000, reps: 42000 },
      { brand: 'BrandA', region: 'Moscow', month: '2025-06', salesRub: 1350000, units: 13500, price: 100, digital: 72000, tv: 145000, pharm: 31000, reps: 41000 },
      { brand: 'BrandA', region: 'Moscow', month: '2025-07', salesRub: 1450000, units: 14500, price: 100, digital: 80000, tv: 160000, pharm: 35000, reps: 45000 },
      { brand: 'BrandA', region: 'Moscow', month: '2025-08', salesRub: 1500000, units: 15000, price: 100, digital: 85000, tv: 170000, pharm: 38000, reps: 48000 }
    ];
    const salesRows = panel.map(p => ({ brand: p.brand, region: p.region, month: p.month, salesRub: p.salesRub, units: p.units, city: 'Moscow' }));
    const promoRows = [
      { brand: 'BrandA', region: 'Moscow', month: '2025-01', bonus: 50000, mech: 'Discount', chain: 'Apteki', city: 'Moscow' }
    ];
    const marketRows = [
      { brand: 'BrandA', region: 'Moscow', month: '2025-01', salesRub: 5000000, units: 50000, market: 'Total', city: 'Moscow' }
    ];

    const automl = runAutoMLEngine(panel as any, salesRows as any, promoRows as any, marketRows as any, 48);
    expect(automl).toBeDefined();
    expect(automl.brands).toBeDefined();
    expect(automl.allBrandsResult).toBeDefined();
    expect(automl.allBrandsResult.bestModelName).toBeDefined();

    const X = panel.map(p => [1, p.digital, p.tv]);
    const vifMap = calculateVIF(X, ['trend', 'digital', 'tv']);
    const vifRes = evaluateVIFRisk(vifMap, true);
    expect(vifRes).toBeDefined();
    expect(vifRes.badgeText).toBeDefined();
  });

  it('Role 2: Brand Manager - Bayesian Budget Optimization', () => {
    const opt = runBayesianBudgetOptimization({
      totalBudget: 2500000,
      marginPct: 0.65,
      currentSpends: { tv: 1200000, bonus: 800000, visits: 500000 }
    });
    expect(opt).toBeDefined();
    expect(opt.channels).toBeDefined();
    expect(opt.channels.length).toBe(3);
    expect(opt.recommendedRevenueUplift).toBeGreaterThan(0);
  });

  it('Role 3: CFO / Financial Controller - Data Quality Audit', () => {
    const mockMarket = [
      { brand: 'BrandA', region: 'Moscow', month: '2025-01', salesRub: 5000000, units: 50000, market: 'Total', city: 'Moscow' }
    ];
    const derived = {
      dupKeys: 0,
      orphans: 0,
      panel: [{ salesRub: 1000000 }],
      months: ['2025-01', '2025-02']
    } as any;

    const audit = runDataQualityAudit(mockMarket, derived);
    expect(audit).toBeDefined();
    expect(Array.isArray(audit)).toBe(true);
    expect(audit.length).toBeGreaterThan(0);
  });

  it('Role 4: Data Scientist - Geo A/B Causal Inference', () => {
    const sales = [
      { city: 'Moscow', region: 'Central', month: '2025-01', salesRub: 1000000 },
      { city: 'Moscow', region: 'Central', month: '2025-02', salesRub: 1100000 },
      { city: 'Moscow', region: 'Central', month: '2025-03', salesRub: 1200000 },
      { city: 'Moscow', region: 'Central', month: '2025-04', salesRub: 1300000 },
      { city: 'Spb', region: 'North', month: '2025-01', salesRub: 900000 },
      { city: 'Spb', region: 'North', month: '2025-02', salesRub: 950000 },
      { city: 'Spb', region: 'North', month: '2025-03', salesRub: 980000 },
      { city: 'Spb', region: 'North', month: '2025-04', salesRub: 1000000 }
    ];
    const visits = [
      { city: 'Moscow', region: 'Central', month: '2025-03', visits: 50 },
      { city: 'Moscow', region: 'Central', month: '2025-04', visits: 60 }
    ];
    const promos = [
      { city: 'Moscow', region: 'Central', month: '2025-03', bonus: 100000, mech: 'A' },
      { city: 'Moscow', region: 'Central', month: '2025-04', bonus: 120000, mech: 'A' }
    ];
    const months = ['2025-01', '2025-02', '2025-03', '2025-04'];

    const geoResult = runGeoABDifferenceInDifferences(sales as any, visits as any, promos as any, months, '2025-03', 'visits');
    expect(geoResult).toBeDefined();
    expect(geoResult?.causalLiftPct).toBeDefined();
    expect(geoResult?.pValueCluster).toBeDefined();
    expect(geoResult?.ciClusterLo).toBeDefined();
    expect(geoResult?.ciClusterHi).toBeDefined();

    // Regional dataset partition (e.g. only Moscow records with multiple chains)
    const moscowOnlySales = [
      { city: 'Moscow', region: 'Central', chain: 'Rigla', month: '2025-01', salesRub: 500000 },
      { city: 'Moscow', region: 'Central', chain: 'Rigla', month: '2025-02', salesRub: 550000 },
      { city: 'Moscow', region: 'Central', chain: 'Rigla', month: '2025-03', salesRub: 700000 },
      { city: 'Moscow', region: 'Central', chain: 'Rigla', month: '2025-04', salesRub: 800000 },
      { city: 'Moscow', region: 'Central', chain: '36.6', month: '2025-01', salesRub: 500000 },
      { city: 'Moscow', region: 'Central', chain: '36.6', month: '2025-02', salesRub: 550000 },
      { city: 'Moscow', region: 'Central', chain: '36.6', month: '2025-03', salesRub: 560000 },
      { city: 'Moscow', region: 'Central', chain: '36.6', month: '2025-04', salesRub: 570000 }
    ];
    const moscowOnlyVisits = [
      { city: 'Moscow', region: 'Central', month: '2025-03', visits: 50 },
      { city: 'Moscow', region: 'Central', month: '2025-04', visits: 60 }
    ];
    const moscowOnlyPromos = [
      { city: 'Moscow', chain: 'Rigla', region: 'Central', month: '2025-03', bonusPct: 5 },
      { city: 'Moscow', chain: 'Rigla', region: 'Central', month: '2025-04', bonusPct: 5 }
    ];
    const moscowPartitionRes = runGeoABDifferenceInDifferences(
      moscowOnlySales as any, moscowOnlyVisits as any, moscowOnlyPromos as any, months, '2025-03', 'bonus', 'Central'
    );
    expect(moscowPartitionRes).toBeDefined();
    expect(moscowPartitionRes?.pValueCluster).toBeDefined();
    expect(moscowPartitionRes?.ciClusterLo).toBeDefined();
    expect(moscowPartitionRes?.ciClusterHi).toBeDefined();
    expect(moscowPartitionRes?.seClusterTotal).toBeGreaterThan(0);
    expect(moscowPartitionRes?.dfCluster).toBeGreaterThanOrEqual(1);
  });

  it('Role 7: Analytics Engineer & Data Developer - Partitions & Quality Audit', () => {
    const rawMarket = [
      { brand: 'BrandA', region: 'Москва', month: '2025-01', salesRub: 1000000, market: 'Total' }
    ];
    const derived = {
      dupKeys: 0,
      orphans: 0,
      panel: [{ salesRub: 1000000 }],
      months: ['2025-01', '2025-02']
    } as any;

    const audit = runDataQualityAudit(rawMarket as any, derived);
    expect(audit).toBeDefined();
    expect(Array.isArray(audit)).toBe(true);
    expect(audit.length).toBeGreaterThan(0);
    expect(audit.some(a => a.title.includes('продаж'))).toBe(true);
  });
});
