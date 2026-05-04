import { describe, expect, test } from '@jest/globals';
import { createNoopLogger } from './noopLogger.js';

describe('createNoopLogger', () => {
  test('provides the log methods used by API and Auth', () => {
    const logger = createNoopLogger();

    expect(() => {
      logger.debug('debug');
      logger.error('error');
      logger.info('info');
      logger.warn('warn');
    }).not.toThrow();
  });
});
