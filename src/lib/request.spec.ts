import { describe, test, expect, afterEach, jest } from '@jest/globals';
import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { MonitorError, NotConnectedError } from '../errors/index.js';
import { DEFAULT_USER_AGENT, requestClient } from './request.js';

const originalAdapter = requestClient.defaults.adapter;

const responseFor = (config: InternalAxiosRequestConfig, data: unknown = { ok: true }): AxiosResponse => ({
  config,
  data,
  headers: {},
  status: 200,
  statusText: 'OK',
});

const withTimeout = async <T>(promise: Promise<T>): Promise<T> => {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('request slot was not released')), 1000);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
};

describe('request client throttling', () => {
  afterEach(() => {
    requestClient.defaults.adapter = originalAdapter;
    jest.restoreAllMocks();
  });

  test('releases the request slot when a ThinQ1 response is translated into an error', async () => {
    let calls = 0;
    const adapter = jest.fn(async (config: InternalAxiosRequestConfig) => {
      calls++;
      if (calls === 1) {
        return responseFor(config, {
          lgedmRoot: {
            returnCd: '0106',
            returnMsg: 'offline',
          },
        });
      }

      return responseFor(config);
    });

    requestClient.defaults.adapter = adapter as AxiosAdapter;

    await expect(requestClient.get('/thinq1-error')).rejects.toThrow(NotConnectedError);
    await expect(withTimeout(requestClient.get('/after-thinq1-error'))).resolves.toMatchObject({ data: { ok: true } });
    expect(adapter).toHaveBeenCalledTimes(2);
  });

  test('releases the request slot when a network error is translated into an error', async () => {
    let calls = 0;
    const adapter = jest.fn(async (config: InternalAxiosRequestConfig) => {
      calls++;
      if (calls === 1) {
        throw new Error('socket closed');
      }

      return responseFor(config);
    });

    requestClient.defaults.adapter = adapter as AxiosAdapter;

    await expect(requestClient.get('/network-error')).rejects.toThrow(NotConnectedError);
    await expect(withTimeout(requestClient.get('/after-network-error'))).resolves.toMatchObject({ data: { ok: true } });
    expect(adapter).toHaveBeenCalledTimes(2);
  });

  test('sends a non-axios User-Agent by default and lets a request override it', async () => {
    const seen: string[] = [];
    const adapter = jest.fn(async (config: InternalAxiosRequestConfig) => {
      seen.push(String(config.headers.get('User-Agent')));
      return responseFor(config);
    });

    requestClient.defaults.adapter = adapter as AxiosAdapter;

    await requestClient.get('/default-user-agent');
    await requestClient.get('/custom-user-agent', { headers: { 'user-agent': 'okhttp/3.14.9' } });

    expect(seen[0]).toBe(DEFAULT_USER_AGENT);
    expect(seen[0]).not.toMatch(/axios/i);
    expect(seen[1]).toBe('okhttp/3.14.9');
  });

  test('preserves unknown ThinQ1 monitor error codes without undefined text', async () => {
    const adapter = jest.fn(async (config: InternalAxiosRequestConfig) => responseFor(config, {
      lgedmRoot: {
        returnCd: '9998',
      },
    }));

    requestClient.defaults.adapter = adapter as AxiosAdapter;

    await expect(requestClient.get('/unknown-thinq1-error')).rejects.toThrow(new MonitorError('9998'));
  });
});
