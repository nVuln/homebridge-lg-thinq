import axios, {AxiosInstance} from 'axios';
import {NotConnectedError, TokenError, TokenExpiredError} from '../errors';

const client = axios.create();
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
      throw new TokenError(code + ' - ' + data.returnMsg || '');
    }
  }

  return response;
}, (err) => {
  if (!err.response || [502, 503, 504].includes(err.response.status) || err.response?.data?.resultCode === '9999') {
    throw new NotConnectedError();
  } else if (axios.isAxiosError(err) && err.response?.data?.resultCode === '0102') {
    throw new TokenExpiredError();
  }

  return Promise.reject(err);
});

export const requestClient = client as AxiosInstance;
