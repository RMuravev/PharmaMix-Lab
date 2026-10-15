import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { PharmaDataStore } from '../../core/store';
import { VirtualTable } from '../components/VirtualTable';

const roots = new Map<string, Root>();

function renderToId(id: string, component: React.ReactNode) {
  const el = document.getElementById(id);
  if (!el) return;
  
  let root = roots.get(id);
  if (!root) {
    root = createRoot(el);
    roots.set(id, root);
  }
  root.render(component);
}

const DIMSD: Record<string, string> = {
  month: 'Месяц (Период)',
  brand: 'SKU Бренд',
  sku: 'SKU Наименование',
  city: 'Город',
  nanobrick: 'Nanobrick',
  chain: 'PhChainName (сеть)',
  federalSubject: 'federal_subject',
  units: 'Выбытия, уп',
  salesRub: 'Выбытия, руб',
  visits: 'CRM Подтв. визиты',
  trp: 'TRP',
  market: 'Адресный рынок',
  region: 'Регион',
  bonusPct: 'Бонус %'
};

/**
 * Section for Data Management & Synchronization.
 * Implements high-performance virtualization for previewing large datasets.
 */
export function renderData(store: PharmaDataStore): void {
  const state = store.getState();

  const renderTable = (containerId: string, data: any[], keys: string[]) => {
    const headers = keys.map(k => DIMSD[k] || k);
    renderToId(containerId, (
      <VirtualTable 
        data={data} 
        columns={keys} 
        headers={headers} 
        height={350}
      />
    ));
  };

  renderTable('salesTableContainer', state.raw.sales, ['month', 'brand', 'sku', 'city', 'nanobrick', 'chain', 'federalSubject', 'units', 'salesRub']);
  renderTable('promoTableContainer', state.raw.promos, ['month', 'chain', 'brand', 'sku', 'bonusPct', 'city']);
  renderTable('visitsTableContainer', state.raw.visits, ['month', 'nanobrick', 'brand', 'visits', 'city', 'region']);
  renderTable('tvTableContainer', state.raw.tv, ['month', 'brand', 'trp']);
  renderTable('marketTableContainer', state.raw.market, ['month', 'market', 'region', 'brand', 'sku', 'units', 'salesRub']);

  const updateStatus = (id: string, count: number) => {
    const el = document.getElementById(id);
    if (el) el.textContent = `${count.toLocaleString()} строк`;
  };

  updateStatus('salesStatus', state.raw.sales.length);
  updateStatus('promoStatus', state.raw.promos.length);
  updateStatus('tvStatus', state.raw.tv.length);
  updateStatus('visitsStatus', state.raw.visits.length);
  updateStatus('marketStatus', state.raw.market.length);
}
