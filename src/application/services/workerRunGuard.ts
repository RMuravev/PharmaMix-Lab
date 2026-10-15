/** Identifies the only worker result that may update a mounted screen. */
export function isCurrentWorkerRun<T>(activeWorker: T | null, worker: T, activeToken: number, runToken: number): boolean {
  return activeWorker === worker && activeToken === runToken;
}
