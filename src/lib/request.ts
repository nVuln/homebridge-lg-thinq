import axios, {AxiosInstance} from 'axios';
import {ManualProcessNeeded, MonitorError, NotConnectedError, TokenExpiredError} from '../errors';
import axiosRetry from 'axios-retry';

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
client.interceptors.response.use((response) => {
  // thinq1 response
  if (typeof response.data === 'object' && 'lgedmRoot' in response.data && 'returnCd' in response.data.lgedmRoot) {
    const data = response.data.lgedmRoot;
    const code = data.returnCd as string;
    if (['0106', '0111'].includes(code)) {
      throw new NotConnectedError(data.returnMsg || '');
    } else if (code === '0102') {
      throw new TokenExpiredError(data.returnMsg);
    } else if (code !== '0000') {
      throw new MonitorError(code + ' - ' + data.returnMsg || '');
    }
  }

  return response;
}, (err) => {
  if (!err.response || err.response.data?.resultCode === '9999') {
    throw new NotConnectedError();
  } else if (err.response.data?.resultCode === '0102') {
    throw new TokenExpiredError();
  } else if (err.response.data?.resultCode === '0110') {
    throw new ManualProcessNeeded('Please open the native LG App and sign in to your account to see what happened, ' +
      'maybe new agreement need your accept. Then try restarting Homebridge.');
  }

  return Promise.reject(err);
});

export const requestClient = client as AxiosInstance;
