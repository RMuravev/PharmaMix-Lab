/**
 * Worker Service for managing background computations and caching.
 * PharmaMix Lab v3.2
 */

import ComputeWorker from './computeWorker?worker';

const cache = new Map<string, any>();

class WorkerService {
  private worker: Worker | null = null;
  private pendingTasks = new Map<string, { resolve: Function; reject: Function }>();

  private getWorker() {
    if (!this.worker) {
      this.worker = new ComputeWorker();
      this.worker.onmessage = (e) => {
        const { type, payload, id } = e.data;
        const task = this.pendingTasks.get(id);
        if (!task) return;

        if (type.endsWith('_SUCCESS')) {
          task.resolve(payload);
        } else {
          task.reject(new Error(payload));
        }
        this.pendingTasks.delete(id);
      };
    }
    return this.worker;
  }

  /**
   * Runs AutoML in the background worker.
   */
  async runAutoML(payload: any): Promise<any> {
    const brandTag = payload.panel?.[0]?.brand || 'all';
    const totalSales = payload.sales?.reduce((acc: number, s: any) => acc + (s.salesRub || 0), 0) || 0;
    const cacheKey = `automl_${payload.panel.length}_${payload.margin}_${payload.sales.length}_${brandTag}_${Math.round(totalSales)}`;
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey);
    }

    const id = Math.random().toString(36).substring(7);
    const worker = this.getWorker();

    return new Promise((resolve, reject) => {
      this.pendingTasks.set(id, { 
        resolve: (res: any) => {
          cache.set(cacheKey, res);
          resolve(res);
        }, 
        reject 
      });
      worker.postMessage({ type: 'RUN_AUTOML', payload, id });
    });
  }

  /**
   * Fits MMM Model in the background worker.
   */
  async fitMMM(panel: any[], useMkt: boolean): Promise<any> {
    const brandTag = panel?.[0]?.brand || 'all';
    const totalSales = panel?.reduce((acc: number, p: any) => acc + (p.salesRub || 0), 0) || 0;
    const cacheKey = `mmm_${panel.length}_${useMkt}_${brandTag}_${Math.round(totalSales)}`;
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey);
    }

    const id = Math.random().toString(36).substring(7);
    const worker = this.getWorker();

    return new Promise((resolve, reject) => {
      this.pendingTasks.set(id, {
        resolve: (res: any) => {
          cache.set(cacheKey, res);
          resolve(res);
        },
        reject
      });
      worker.postMessage({ type: 'FIT_MMM_MODEL', payload: { panel, useMkt }, id });
    });
  }

  /**
   * Clears the computation cache.
   */
  clearCache() {
    cache.clear();
  }
}

export const workerService = new WorkerService();
