import { describe, expect, it } from 'vitest';
import { isCurrentWorkerRun } from './workerRunGuard';

describe('worker run guard', () => {
  it('accepts only the active worker and generation', () => {
    const worker = {};
    expect(isCurrentWorkerRun(worker, worker, 4, 4)).toBe(true);
    expect(isCurrentWorkerRun(worker, worker, 5, 4)).toBe(false);
    expect(isCurrentWorkerRun(null, worker, 4, 4)).toBe(false);
    expect(isCurrentWorkerRun({}, worker, 4, 4)).toBe(false);
  });

  it('rejects a terminal error from a cancelled or replaced run', () => {
    const oldWorker = {};
    const newWorker = {};
    expect(isCurrentWorkerRun(newWorker, oldWorker, 2, 1)).toBe(false);
    expect(isCurrentWorkerRun(null, oldWorker, 2, 2)).toBe(false);
  });
});
