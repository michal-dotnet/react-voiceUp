import type { LogLevel } from '../config/env.js';

type Fields = Record<string, unknown>;

export interface Logger {
  debug(message: string, fields?: Fields): void;
  info(message: string, fields?: Fields): void;
  warn(message: string, fields?: Fields): void;
  error(message: string, fields?: Fields): void;
}

const SEVERITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

function writeToStdout(line: string): void {
  process.stdout.write(`${line}\n`);
}

/**
 * Minimal structured (JSON lines) logger. Callers must never pass passwords, tokens,
 * request bodies or other sensitive data as fields.
 */
export function createLogger(
  level: LogLevel,
  write: (line: string) => void = writeToStdout,
): Logger {
  const threshold = SEVERITY[level];

  const log =
    (messageLevel: Exclude<LogLevel, 'silent'>) =>
    (message: string, fields?: Fields): void => {
      if (SEVERITY[messageLevel] < threshold) return;
      write(
        JSON.stringify({ ...fields, time: new Date().toISOString(), level: messageLevel, message }),
      );
    };

  return {
    debug: log('debug'),
    info: log('info'),
    warn: log('warn'),
    error: log('error'),
  };
}
