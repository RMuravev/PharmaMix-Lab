/**
 * Global Logging and Monitoring Service for PharmaMix Lab.
 * Implements logging levels and metric tracking for analytical performance.
 */

export type LogLevel = 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: any;
}

class AppLogger {
  private logs: LogEntry[] = [];
  private readonly MAX_LOGS = 1000;

  info(message: string, context?: any) {
    this.addLog('info', message, context);
  }

  warn(message: string, context?: any) {
    this.addLog('warn', message, context);
  }

  error(message: string, error?: Error | string, context?: any) {
    const errorMsg = error instanceof Error ? error.message : error;
    const errorStack = error instanceof Error ? error.stack : undefined;
    this.addLog('error', message, { error: errorMsg, stack: errorStack, ...context });
  }

  metric(name: string, value: number, tags?: Record<string, string>) {
    // Tracking performance metrics (e.g. calculation time)
    this.addLog('info', `Metric: ${name} = ${value}`, { type: 'performance', ...tags });
  }

  private addLog(level: LogLevel, message: string, context?: any) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context
    };

    this.logs.unshift(entry);
    if (this.logs.length > this.MAX_LOGS) {
      this.logs.pop();
    }

    // Output to console in development
    const color = level === 'error' ? 'color: #ef4444' : level === 'warn' ? 'color: #f59e0b' : 'color: #3b82f6';
    console.log(`%c[${level.toUpperCase()}] %c${message}`, color, 'color: inherit', context || '');
  }

  getRecentLogs(limit = 100) {
    return this.logs.slice(0, limit);
  }

  exportLogs() {
    return JSON.stringify(this.logs, null, 2);
  }
}

export const logger = new AppLogger();
