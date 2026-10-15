/**
 * PharmaMix Lab v3.1 - Строгая система типов предметной области
 */

export interface RawSalesRow {
  month: string;
  year?: number;
  monthNum?: number;
  federalDistrict?: string;
  federalSubject?: string;
  region: string;
  city: string;
  nanobrick?: string;
  chain: string;
  brand: string;
  sku: string;
  units: number;
  salesRub: number;
}

export interface RawPromoRow {
  month: string;
  year?: number;
  monthNum?: number;
  chain: string;
  brand: string;
  sku: string;
  bonusPct: number;
  mechanic?: string;
  region?: string;
  city?: string;
  nanobrick?: string;
}

export interface RawTVRow {
  month: string;
  year?: number;
  monthNum?: number;
  brand: string;
  trp: number;
}

export interface RawVisitRow {
  month: string;
  year?: number;
  monthNum?: number;
  nanobrick?: string;
  region: string;
  city: string;
  brand: string;
  visits: number;
}

export interface RawMarketRow {
  month: string;
  year?: number;
  monthNum?: number;
  market: string;
  region: string;
  city?: string;
  nanobrick?: string;
  brand: string;
  sku?: string;
  units: number;
  salesRub: number;
  isOwn?: boolean;
}

export interface SalesFineEntry {
  id: number;
  month: string;
  year?: number;
  monthNum?: number;
  federalDistrict?: string;
  federalSubject?: string;
  nanobrick?: string;
  region: string;
  city: string;
  chain: string;
  brand: string;
  sku: string;
  units: number;
  rub: number;
  nsrc: number;
  mechs: Array<{ m: string; rate: number }>;
  rate: number;
}

export interface PanelRecord {
  /** Optional dimensions for granular series; absent on legacy brand-month panels. */
  region?: string;
  chain?: string;
  brand: string;
  month: string;
  units: number;
  salesRub: number;
  trp: number;
  hasTRP: boolean;
  visits: number;
  hasVis: boolean;
  bonusIdx: number;
  comp: number;
  next: PanelRecord | null;
}

export interface DerivedStructures {
  ownBrands: Set<string>;
  brandMarket: Map<string, string>;
  mktIdx: Map<string, { rub: number; units: number }>;
  salesFine: Map<string, SalesFineEntry>;
  dupKeys: number;
  orphans: number;
  months: string[];
  skuFirstMonth: Map<string, string>;
  panel: PanelRecord[];
  /** Observed brand × region × chain × month sales; never zero-filled. */
  detailedPanel: import('../application/services/panelSalesPreparationService').PreparedPanelRow[];
  detailedPanelErrors: string[];
  atoms: PromoAtom[];
  promoRows: number;
  adjFail: number;
  dualStats: {
    sumRollingDR: number;
    sumCfDR: number;
    countDual: number;
  };
  st: SettingsConfig;
}

export interface SettingsConfig {
  nM: number;
  minH: number;
  excl: boolean;
  adj: boolean;
  method: 'dual' | 'rolling' | 'counterfactual';
  margin: number;
}

export interface PromoAtom {
  fid: number;
  month: string;
  region: string;
  city: string;
  chain: string;
  brand: string;
  sku: string;
  mech: string;
  rate: number;
  valid: boolean;
  actU: number;
  actR: number;
  actUV: number;
  actRV: number;
  baseU: number;
  baseR: number;
  baseURolling: number;
  baseRRolling: number;
  baseUCf: number;
  baseRCf: number;
  bonus: number;
  bonusV: number;
}

export interface AggregatedFinGroup {
  dims: string[];
  ids: Set<number>;
  vids: Set<number>;
  actU: number;
  actR: number;
  actUV: number;
  actRV: number;
  baseU: number;
  baseR: number;
  bonus: number;
  bonusV: number;
  n?: number;
  nv?: number;
  dU?: number;
  dR?: number;
  uplift?: number;
  roas?: number;
  be?: number;
  profit?: number;
  roi?: number;
  cov?: number;
}

export interface OLSResult {
  n: number;
  k: number;
  beta: number[];
  se: number[];
  seR: number[];
  t: number[];
  p: number[];
  pR: number[];
  ci: number[][];
  res: number[];
  fit: number[];
  ssr: number;
  df: number;
  sigma: number;
  r2: number;
  adjR2: number;
  F: number;
  pF: number;
}

export interface ModelFit {
  rows: PanelRecord[];
  spec: {
    names: string[];
    fns?: Array<(r: PanelRecord) => number>;
    m0: number;
    notes: string[];
    season: boolean;
    months: string[];
  };
  fit: {
    m: OLSResult;
    X: number[][];
    y: number[];
    smear: number;
  };
  vif: Record<string, number>;
  dw: number;
  jb: { S: number; K: number; jb: number; p: number };
  pred: number[];
  mape: number;
  useMkt: boolean;
  brands: string[];
  err?: string;
}

export interface OOSValidationResult {
  preds: any[];
  models: Array<[string, string]>;
  met: Record<string, {
    n: number;
    mape: number;
    wape: number;
    rmse: number;
    bias: number;
    rel?: number;
  }>;
  months: string[];
  testM: string[];
  H: number;
  scheme: string;
  trainN: number;
  testN: number;
  trainM: string[];
}

export interface PartitionLogEntry {
  id: string;
  type: string;
  typeName: string;
  fileName: string;
  months: string[];
  newCount: number;
  updatedCount: number;
  totalCount: number;
  time: string;
}

export interface DataCheckItem {
  title: string;
  status: 'ok' | 'warn' | 'fail';
  detail: string;
}

export interface CityExperimentRecord {
  city: string;
  region: string;
  preSales: number[];
  postSales: number[];
  meanPre: number;
  meanPost: number;
  rawGrowth: number;
  postVisits: number;
  avgBonus: number;
  isTreated: boolean;
  matchScore: number;
  weight: number;
  role: 'treat' | 'matched_control' | 'pool';
}

export interface GeoABExperimentResult {
  factor: 'visits' | 'bonus' | 'both';
  splitMonth: string;
  allMonths: string[];
  preMonths: string[];
  postMonths: string[];
  cityList: CityExperimentRecord[];
  treatGroup: CityExperimentRecord[];
  matchedControl: CityExperimentRecord[];
  treatSeries: number[];
  scaledControlSeries: number[];
  counterfactualSeries: (number | null)[];
  totalCausalLift: number;
  causalLiftMonthly: number;
  causalLiftPct: number;
  seClusterTotal: number;
  ciClusterLo: number;
  ciClusterHi: number;
  pValueCluster: number;
  dfCluster: number;
  placeboPassed: boolean;
  placeboEffect: number;
  placeboP: number;
  parallelTrendsValid: boolean;
  deltaSlopePct: number;
  r2Pre: number;
}

export type UserRole =
  | 'all'
  | 'analytics'
  | 'regional'
  | 'cmo'
  | 'ds'
  | 'cfo'
  | 'board'
  | 'developer';

export interface RoleDefinition {
  id: UserRole;
  title: string;
  badge: string;
  icon: string;
  timeEstimate: string;
  jobToBeDone: string;
  solution: string;
  result: string;
  primaryPage: string;
  recommendedPages: string[];
}

export const ROLES_REGISTRY: Record<UserRole, RoleDefinition> = {
  all: {
    id: 'all',
    title: 'Все разделы (Полный доступ)',
    badge: 'Администратор',
    icon: '✦',
    timeEstimate: 'Неограниченно',
    jobToBeDone: 'Полный сквозной доступ ко всем аналитическим, плановым и исследовательским модулям платформы.',
    solution: 'Единая навигация по 4 кластерам JTBD',
    result: '100% покрытие всех возможностей MMM & Causal движка',
    primaryPage: 'portal',
    recommendedPages: ['portal', 'top-roi', 'regional-deepdive', 'whatif-scenarios', 'model-tournament', 'data-partitions']
  },
  analytics: {
    id: 'analytics',
    title: 'Marketing Analytics Lead',
    badge: 'Аналитика ROI',
    icon: '📊',
    timeEstimate: '30 сек — 5 мин',
    jobToBeDone: 'Оценить реальный ROI каждого канала продвижения за 5 минут вместо 2 часов ручной выгрузки.',
    solution: '«Quick Insight» режим + «Top ROI Channels» с декомпозицией кривых насыщения Hill',
    result: '2 часа ручного анализа → 5 минут на готовый вывод',
    primaryPage: 'top-roi',
    recommendedPages: ['top-roi', 'budget-roi', 'whatif-scenarios', 'exec-brief']
  },
  regional: {
    id: 'regional',
    title: 'Regional Sales Manager',
    badge: 'Регионы & Сети',
    icon: '🏪',
    timeEstimate: '3 — 10 мин',
    jobToBeDone: 'Понять, почему в подотчетном регионе или нанобриках выросли или упали продажи.',
    solution: '«Regional Deep Dive» модуль с детализацией по аптечным сетям и Causal Geo A/B тестами',
    result: 'Одна кнопка → глубокий причинно-следственный срез по региону',
    primaryPage: 'regional-deepdive',
    recommendedPages: ['regional-deepdive', 'causal-tests', 'seasonality-analysis']
  },
  cmo: {
    id: 'cmo',
    title: 'Chief Marketing Officer (CMO)',
    badge: 'Стратегия & Бюджет',
    icon: '💼',
    timeEstimate: '5 — 20 мин',
    jobToBeDone: 'Спланировать маркетинговый бюджет на следующий период с уверенностью и обоснованной отдачей.',
    solution: '«Budget Scenario Planner» с интерактивным What-If симулятором и 95% доверительным интервалом',
    result: '3–5 реалистичных сценариев за одну сессию с минимизацией рисков',
    primaryPage: 'whatif-scenarios',
    recommendedPages: ['whatif-scenarios', 'budget-optimization', 'scenario-comparison', 'exec-brief']
  },
  ds: {
    id: 'ds',
    title: 'Data Scientist & ML Engineer',
    badge: 'AI & Нейросети',
    icon: '🤖',
    timeEstimate: '5 — 15 мин',
    jobToBeDone: 'Протестировать альтернативные эконометрические модели и нейросети без долгого ожидания.',
    solution: '«Model Tournament Lab» на базе Web Workers, Causal TCN и OOS валидации',
    result: '1–2 модели/день → 14 моделей за один автоматический запуск',
    primaryPage: 'model-tournament',
    recommendedPages: ['model-tournament', 'oos-validation', 'causal-tests', 'share-experiment']
  },
  cfo: {
    id: 'cfo',
    title: 'Finance Director / CFO',
    badge: 'Финансы & Аудит',
    icon: '💰',
    timeEstimate: '2 — 10 мин',
    jobToBeDone: 'Оправдать коммерческие и маркетинговые расходы перед Советом директоров аудируемыми формулами.',
    solution: '«Financial Accountability Report» с прозрачным расчетом чистой прибыли и безубыточной маржи',
    result: 'Прозрачные расчеты, готовый экспорт формул в Excel/PDF для аудиторов',
    primaryPage: 'budget-roi',
    recommendedPages: ['budget-roi', 'scenario-comparison', 'exec-brief', 'share-experiment']
  },
  board: {
    id: 'board',
    title: 'Board / C-Level Executive',
    badge: 'Совет директоров',
    icon: '👔',
    timeEstimate: '1 — 3 мин',
    jobToBeDone: 'За 5 минут понять общую эффективность коммерческих инвестиций и динамику брендов.',
    solution: '«Executive Brief» (интерактивный полноэкранный Pitch Deck в 1 клик)',
    result: '1 клик → готовая 5–7 слайдовая презентация со всеми макро-KPI',
    primaryPage: 'exec-brief',
    recommendedPages: ['exec-brief', 'top-roi', 'scenario-comparison']
  },
  developer: {
    id: 'developer',
    title: 'Analytics Engineer & Tech Dev',
    badge: 'Данные & Движок',
    icon: '🛠️',
    timeEstimate: '2 — 15 мин',
    jobToBeDone: 'Управлять качеством данных, партициями, гео-справочниками нанобриков и мониторить движок.',
    solution: '«Data Engineering & Technical Hub»: партиции, Data Quality Auditor, реестр нанобриков и Worker-монитор',
    result: 'Zero-loss ETL, 100% валидированные данные и мониторинг вычислительных ядер',
    primaryPage: 'data-partitions',
    recommendedPages: ['data-partitions', 'data-quality', 'tech-monitor', 'share-experiment']
  }
};
