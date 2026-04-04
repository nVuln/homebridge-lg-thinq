import axios, { AxiosInstance } from 'axios';
import {
  ManualProcessNeeded,
  ManualProcessNeededErrorCode,
  NotConnectedError,
  TokenExpiredErrorCode,
  TokenExpiredError,
} from '../errors/index.js';
import axiosRetry from 'axios-retry';

const MAX_REQUESTS_COUNT = 1;
const INTERVAL_MS = 10;
let PENDING_REQUESTS = 0;

const client = axios.create();
client.defaults.timeout = 60000; // 60s timeout
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
  PENDING_REQUESTS = Math.max(0, PENDING_REQUESTS - 1);
  return Promise.resolve(response);
}, (err) => {
  if (!err.response || err.response.data?.resultCode === '9999') {
    throw new NotConnectedError();
  } else if (err.response.data?.resultCode === TokenExpiredErrorCode) {
    throw new TokenExpiredError();
  } else if (err.response.data?.resultCode === ManualProcessNeededErrorCode) {
    throw new ManualProcessNeeded('Please open the native LG App and sign in to your account to see what happened, ' +
      'maybe new agreement need your accept. Then try restarting Homebridge.');
  }
  PENDING_REQUESTS = Math.max(0, PENDING_REQUESTS - 1);
  return Promise.reject(err);
});

export const requestClient = client as AxiosInstance;
