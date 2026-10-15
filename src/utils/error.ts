import { notificationService } from '../ui/NotificationCenter';

/**
 * Wraps an async function in a try-catch block with automatic error reporting.
 */
export async function safeExecuteAsync<T>(
  fn: () => Promise<T>,
  contextName: string,
  onFinally?: () => void
): Promise<T | null> {
  try {
    return await fn();
  } catch (error: any) {
    console.error(`Error in ${contextName}:`, error);
    notificationService.error(
      `Ошибка: ${contextName}`,
      error.message || 'Произошла неизвестная ошибка при выполнении операции.'
    );
    return null;
  } finally {
    if (onFinally) onFinally();
  }
}

/**
 * Wraps a synchronous function in a try-catch block with automatic error reporting.
 */
export function safeExecute<T>(
  fn: () => T,
  contextName: string
): T | null {
  try {
    return fn();
  } catch (error: any) {
    console.error(`Error in ${contextName}:`, error);
    notificationService.error(
      `Ошибка: ${contextName}`,
      error.message || 'Произошла неизвестная ошибка.'
    );
    return null;
  }
}
