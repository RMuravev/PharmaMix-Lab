import type { WorkerRequest, WorkerResponse, WorkerTaskType } from './protocol';

type PendingTask = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  onProgress?: (progress: number, message?: string) => void;
};

export interface SubmitOptions {
  timeoutMs?: number;
  onProgress?: (progress: number, message?: string) => void;
}

/** Lifecycle-safe client for a single Web Worker. Instantiate lazily in browser-only code. */
export class WorkerClient {
  private readonly pending = new Map<string, PendingTask>();
  private disposed = false;
  private nextId = 0;

  constructor(private readonly worker: Worker, private readonly defaultTimeoutMs = 120_000) {
    worker.addEventListener('message', this.handleMessage);
    worker.addEventListener('error', this.handleError);
    worker.addEventListener('messageerror', this.handleMessageError);
  }

  submit<T>(type: WorkerTaskType, payload: unknown, versions: { datasetVersion: string; algorithmVersion: string }, options: SubmitOptions = {}): Promise<T> {
    if (this.disposed) return Promise.reject(new Error('WorkerClient уже закрыт.'));
    const id = `task-${Date.now().toString(36)}-${(++this.nextId).toString(36)}`;
    const timeoutMs = Math.max(1_000, options.timeoutMs ?? this.defaultTimeoutMs);
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Расчёт ${type} превысил лимит времени (${timeoutMs} мс).`));
      }, timeoutMs);
      this.pending.set(id, { resolve: value => resolve(value as T), reject, timer, onProgress: options.onProgress });
      const message: WorkerRequest = { id, type, payload, ...versions };
      try { this.worker.postMessage(message); }
      catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  cancel(id: string): boolean {
    const task = this.pending.get(id);
    if (!task) return false;
    clearTimeout(task.timer);
    this.pending.delete(id);
    task.reject(new Error('Расчёт отменён пользователем.'));
    // Workers may optionally handle this protocol message; a running synchronous task
    // cannot be interrupted until it yields to the event loop.
    try { this.worker.postMessage({ id, type: 'cancel' }); } catch { /* worker may already be gone */ }
    return true;
  }

  dispose(reason = 'Worker остановлен.') {
    if (this.disposed) return;
    this.disposed = true;
    this.worker.removeEventListener('message', this.handleMessage);
    this.worker.removeEventListener('error', this.handleError);
    this.worker.removeEventListener('messageerror', this.handleMessageError);
    for (const [id, task] of this.pending) {
      clearTimeout(task.timer);
      task.reject(new Error(reason));
      this.pending.delete(id);
    }
    this.worker.terminate();
  }

  private readonly handleMessage = (event: MessageEvent<WorkerResponse>) => {
    const response = event.data;
    if (!response || typeof response.id !== 'string') return;
    const task = this.pending.get(response.id);
    if (!task) return;
    if (response.type === 'progress') {
      task.onProgress?.(Math.max(0, Math.min(1, response.progress)), response.message);
      return;
    }
    clearTimeout(task.timer);
    this.pending.delete(response.id);
    if (response.type === 'success') task.resolve(response.result);
    else task.reject(new Error(`${response.error.code}: ${response.error.message}`));
  };

  private readonly handleError = (event: ErrorEvent) => {
    const message = event.message || 'Неизвестная ошибка Web Worker.';
    this.rejectAll(new Error(`Ошибка вычислительного Worker: ${message}`));
  };

  private readonly handleMessageError = () => this.rejectAll(new Error('Не удалось десериализовать сообщение от Worker.'));

  private rejectAll(error: Error) {
    for (const [id, task] of this.pending) {
      clearTimeout(task.timer);
      task.reject(error);
      this.pending.delete(id);
    }
  }
}
