import axios, { AxiosInstance } from 'axios';
import {
  ManualProcessNeeded,
  ManualProcessNeededErrorCode,
  MonitorError,
  NotConnectedError,
  TokenExpiredErrorCode,
  TokenExpiredError,
  NotConnectedErrorCodes,
} from '../errors/index.js';
import axiosRetry from 'axios-retry';

const MAX_REQUESTS_COUNT = 1;
const INTERVAL_MS = 10;
let PENDING_REQUESTS = 0;

const releaseRequestSlot = () => {
  PENDING_REQUESTS = Math.max(0, PENDING_REQUESTS - 1);
};

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function responseErrorMessage(err: any, fallback: string): string {
  return stringValue(err.response?.data?.error?.message)
    || stringValue(err.response?.data?.message)
    || stringValue(err.response?.data?.returnMsg)
    || stringValue(err.message)
    || fallback;
}

function errorWithCause<T extends Error>(error: T, cause: unknown): T {
  (error as Error & { cause?: unknown }).cause = cause;
  return error;
}

const client = axios.create();
client.defaults.timeout = 60000; // 60s timeout

client.interceptors.request.use((config) => {
  return new Promise((resolve) => {
    const interval = setInterval(() => {
      if (PENDING_REQUESTS < MAX_REQUESTS_COUNT) {
        PENDING_REQUESTS++;
        clearInterval(interval);
        resolve(config);
      }
    }, INTERVAL_MS);
  });
});

client.interceptors.response.use((response) => {
  releaseRequestSlot();
  return response;
}, (err) => {
  releaseRequestSlot();
  return Promise.reject(err);
});

axiosRetry(client, {
  retries: 2, // try 3 times
  retryDelay: (retryCount) => {
    return retryCount * 2000;
  },
  retryCondition: (err) => {
    if (err.code?.indexOf('ECONN') === 0) {
      return true;
    }

    return err.response !== undefined && [500, 501, 502, 503, 504].includes(err.response.status);
  },
  shouldResetTimeout: true, // reset timeout each retries
});

client.interceptors.response.use((response) => {
  // thinq1 response
  if (typeof response.data === 'object' && 'lgedmRoot' in response.data && 'returnCd' in response.data.lgedmRoot) {
    const data = response.data.lgedmRoot;
    const code = data.returnCd as string;
    if (NotConnectedErrorCodes.includes(code)) {
      throw new NotConnectedError(data.returnMsg || '');
    } else if (code === TokenExpiredErrorCode) {
      throw new TokenExpiredError(data.returnMsg);
    } else if (code !== '0000') {
      throw new MonitorError(data.returnMsg ? code + ' - ' + data.returnMsg : code);
    }
  }

  return response;
}, (err) => {
  if (!err.response) {
    throw errorWithCause(new NotConnectedError(responseErrorMessage(err, 'Network request failed.')), err);
  } else if (err.response.data?.resultCode === '9999') {
    throw errorWithCause(new NotConnectedError(responseErrorMessage(err, 'ThinQ service is not connected.')), err);
  } else if (err.response.data?.resultCode === TokenExpiredErrorCode) {
    throw errorWithCause(new TokenExpiredError(responseErrorMessage(err, 'ThinQ token expired.')), err);
  } else if (err.response.data?.resultCode === ManualProcessNeededErrorCode) {
    throw errorWithCause(
      new ManualProcessNeeded('Please open the native LG App and sign in to your account to see what happened, ' +
        'maybe new agreement need your accept. Then try restarting Homebridge.'),
      err,
    );
  }
  return Promise.reject(err);
});

export const requestClient = client as AxiosInstance;
