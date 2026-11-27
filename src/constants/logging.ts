export const LOG_LEVELS = [
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
  'silent',
] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

export const DEFAULT_LOG_LEVEL: LogLevel = 'info';

export const REQUEST_ID_HEADER = 'x-request-id';
export const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

export const UNLOGGED_PATHS: ReadonlySet<string> = new Set([
  '/health',
  '/metrics',
]);
