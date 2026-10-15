/**
 * PharmaMix Lab v3.1 - Централизованный типизированный DataStore
 * Реализует чистый Pub/Sub шаблон управления состоянием, изолированный от DOM и React.
 */

import {
  RawSalesRow,
  RawPromoRow,
  RawTVRow,
  RawVisitRow,
  RawMarketRow,
  DerivedStructures,
  ModelFit,
  OOSValidationResult,
  PartitionLogEntry,
  GeoABExperimentResult,
  SettingsConfig,
  UserRole
} from '../types/pharma';

export interface PharmaStoreState {
  raw: {
    sales: RawSalesRow[];
    promos: RawPromoRow[];
    tv: RawTVRow[];
    visits: RawVisitRow[];
    market: RawMarketRow[];
  };
  derived: DerivedStructures;
  reg: ModelFit | null;
  val: OOSValidationResult | null;
  valDirty: boolean;
  geoAb: GeoABExperimentResult | null;
  partitionLogs: PartitionLogEntry[];
  uploadMode: 'append' | 'overwrite';
  imported: {
    sales: boolean;
    promo: boolean;
    tv: boolean;
    visits: boolean;
    market: boolean;
  };
  illnessData: any[];
  illnessSource: string;
  activeRole: UserRole;
  activePage: string;
  viewMode: 'analyst' | 'presentation';
  annotations: Record<string, string>;
  drilldownModal: {
    open: boolean;
    title: string;
    subtitle?: string;
    metrics?: Array<{ label: string; value: string; color?: string }>;
    breakdown?: Array<{ name: string; share: number; val: string; trend?: string }>;
    targetPage?: string;
    targetFilters?: Record<string, string>;
  } | null;
  isFullscreenPitch: boolean;
  presentationSlideIndex: number;
  isLoading: boolean;
  isLoadingAutoML: boolean;
  isLoadingReg: boolean;
  globalFilters: {
    brand: string;
    region: string;
    chain: string;
  };
  automlSummary: any | null;
}

export interface GlobalFilters {
  brand: string;
  region: string;
  chain: string;
}

export type StoreListener = (state: PharmaStoreState) => void;

function createInitialState(): PharmaStoreState {
  const initialSettings: SettingsConfig = {
    nM: 3,
    minH: 2,
    excl: true,
    adj: false,
    method: 'dual',
    margin: 0.48
  };

  const initialDerived: DerivedStructures = {
    ownBrands: new Set<string>(),
    brandMarket: new Map<string, string>(),
    mktIdx: new Map(),
    salesFine: new Map(),
    dupKeys: 0,
    orphans: 0,
    months: [],
    skuFirstMonth: new Map(),
    panel: [],
    detailedPanel: [],
    detailedPanelErrors: [],
    atoms: [],
    promoRows: 0,
    adjFail: 0,
    dualStats: {
      sumRollingDR: 0,
      sumCfDR: 0,
      countDual: 0
    },
    st: initialSettings
  };

  return {
    raw: {
      sales: [],
      promos: [],
      tv: [],
      visits: [],
      market: []
    },
    derived: initialDerived,
    reg: null,
    val: null,
    valDirty: true,
    geoAb: null,
    partitionLogs: [],
    uploadMode: 'append',
    imported: {
      sales: false,
      promo: false,
      tv: false,
      visits: false,
      market: false
    },
    illnessData: [],
    illnessSource: 'НИИ Гриппа им. А.А. Смородинцева (influenza.spb.ru)',
    activeRole: (typeof window !== 'undefined' && (localStorage.getItem('pharmamix_role') as any)) || 'all',
    activePage: (typeof window !== 'undefined' && localStorage.getItem('pharmamix_page')) || 'exec-brief',
    viewMode: 'presentation',
    annotations: {
      'overview-contrib': 'Базовые продажи обеспечивают 62% выручки; ТМА и ТВ промо дают наибольший Инкрементальный ROI (+3.8x).',
      'seasonality-stl': 'Пик заболеваемости ОРВИ в ноябре-феврале формирует сезонный спрос +42% к тренду.',
      'promo-roi': 'Аптечная сеть Ригла показывает максимальную окупаемость акционерного дисконта (NIX = 1.48).'
    },
    drilldownModal: null,
    isFullscreenPitch: false,
    presentationSlideIndex: 0,
    isLoading: false,
    isLoadingAutoML: false,
    isLoadingReg: false,
    globalFilters: {
      brand: '',
      region: '',
      chain: ''
    },
    automlSummary: null
  };
}

/**
 * Возвращает срез сырых данных (raw), отфильтрованный по выбранным в шапке глобальным фильтрам.
 */
export function getFilteredRaw(raw: PharmaStoreState['raw'], filters?: GlobalFilters): PharmaStoreState['raw'] {
  const salesRaw = raw?.sales || [];
  const promosRaw = raw?.promos || [];
  const tvRaw = raw?.tv || [];
  const visitsRaw = raw?.visits || [];
  const marketRaw = raw?.market || [];

  if (!filters || (!filters.brand && !filters.region && !filters.chain)) {
    return { sales: salesRaw, promos: promosRaw, tv: tvRaw, visits: visitsRaw, market: marketRaw };
  }
  const { brand, region, chain } = filters;

  const sales = salesRaw.filter(s => {
    if (brand && s.brand !== brand) return false;
    if (region && s.region !== region && s.federalSubject !== region) return false;
    if (chain && s.chain !== chain) return false;
    return true;
  });

  const promos = promosRaw.filter(p => {
    if (brand && p.brand !== brand) return false;
    if (chain && p.chain !== chain) return false;
    return true;
  });

  const tv = tvRaw.filter(t => {
    if (brand && t.brand !== brand) return false;
    return true;
  });

  const visits = visitsRaw.filter(v => {
    if (brand && v.brand !== brand) return false;
    if (region && v.region !== region && v.nanobrick !== region) return false;
    return true;
  });

  const market = marketRaw.filter(m => {
    if (region && m.region && m.region !== region) return false;
    return true;
  });

  return { sales, promos, tv, visits, market };
}

export class PharmaDataStore {
  private state: PharmaStoreState;
  private listeners: Set<StoreListener> = new Set();

  constructor() {
    this.state = createInitialState();
  }

  public getState(): PharmaStoreState {
    return this.state;
  }

  public setRole(role: UserRole): void {
    if (typeof window !== 'undefined') {
      try { localStorage.setItem('pharmamix_role', role); } catch (_) {}
    }
    this.update(draft => { draft.activeRole = role; });
  }

  public setPage(page: string): void {
    if (typeof window !== 'undefined') {
      try { localStorage.setItem('pharmamix_page', page); } catch (_) {}
    }
    this.update(draft => { draft.activePage = page; });
  }

  public update(updater: (draft: PharmaStoreState) => void, silent = false): void {
    updater(this.state);
    if (!silent) {
      this.notify();
    }
  }

  public subscribe(listener: StoreListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public notify(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.state);
      } catch (err) {
        console.error('Error in PharmaDataStore subscriber:', err);
      }
    }
  }

  public reset(): void {
    this.state = createInitialState();
    this.notify();
  }
}

export const store = new PharmaDataStore();

export function setViewMode(mode: 'analyst' | 'presentation'): void {
  store.update(draft => {
    draft.viewMode = mode;
  });
}

export function setAnnotation(id: string, text: string): void {
  store.update(draft => {
    draft.annotations[id] = text;
  });
}

export function triggerDrilldown(payload: {
  title: string;
  subtitle?: string;
  metrics?: Array<{ label: string; value: string; color?: string }>;
  breakdown?: Array<{ name: string; share: number; val: string; trend?: string }>;
  targetPage?: string;
  targetFilters?: Record<string, string>;
}): void {
  store.update(draft => {
    draft.drilldownModal = {
      open: true,
      ...payload
    };
  });
}

export function closeDrilldown(): void {
  store.update(draft => {
    if (draft.drilldownModal) {
      draft.drilldownModal.open = false;
    }
  });
}
