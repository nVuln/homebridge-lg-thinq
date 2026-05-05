import type { Logger } from 'homebridge';

export function createNoopLogger(): Logger {
  const noop = () => undefined;

  return {
    debug: noop,
    error: noop,
    info: noop,
    log: noop,
    success: noop,
    warn: noop,
  } as unknown as Logger;
}
