/**
 * Logger utility with configurable verbosity levels
 */

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
  TRACE = 4
}

export class Logger {
  private static instance: Logger;
  private level: LogLevel = LogLevel.INFO;
  private prefix: string = '[svelte-proxy-lsp]';

  private constructor() {}

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  setLevelFromString(level: string): void {
    switch (level.toLowerCase()) {
      case 'error':
        this.level = LogLevel.ERROR;
        break;
      case 'warn':
      case 'warning':
        this.level = LogLevel.WARN;
        break;
      case 'info':
        this.level = LogLevel.INFO;
        break;
      case 'debug':
        this.level = LogLevel.DEBUG;
        break;
      case 'trace':
      case 'verbose':
        this.level = LogLevel.TRACE;
        break;
      default:
        this.level = LogLevel.INFO;
    }
  }

  setPrefix(prefix: string): void {
    this.prefix = prefix;
  }

  private formatMessage(level: string, message: string, ...args: any[]): string {
    const timestamp = new Date().toISOString();
    const formattedArgs = args.length > 0 ? ' ' + args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    ).join(' ') : '';
    return `${timestamp} ${this.prefix} [${level}] ${message}${formattedArgs}`;
  }

  private shouldLog(level: LogLevel): boolean {
    return level <= this.level;
  }

  error(message: string, ...args: any[]): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      console.error(this.formatMessage('ERROR', message, ...args));
    }
  }

  warn(message: string, ...args: any[]): void {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(this.formatMessage('WARN', message, ...args));
    }
  }

  info(message: string, ...args: any[]): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.log(this.formatMessage('INFO', message, ...args));
    }
  }

  debug(message: string, ...args: any[]): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.log(this.formatMessage('DEBUG', message, ...args));
    }
  }

  trace(message: string, ...args: any[]): void {
    if (this.shouldLog(LogLevel.TRACE)) {
      console.log(this.formatMessage('TRACE', message, ...args));
    }
  }

  // For LSP window/logMessage compatibility
  lspLog(type: number, message: string): void {
    // LSP MessageType: Error = 1, Warning = 2, Info = 3, Log = 4
    switch (type) {
      case 1:
        this.error(message);
        break;
      case 2:
        this.warn(message);
        break;
      case 3:
        this.info(message);
        break;
      case 4:
      default:
        this.debug(message);
        break;
    }
  }
}

// Export singleton instance
export const logger = Logger.getInstance();