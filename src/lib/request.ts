import axios, {AxiosInstance} from 'axios';
import {NotConnectedError} from '../errors';

const client = axios.create();
client.interceptors.response.use((response) => {
  // Do something with response data
  return response;
}, (err) => {
  if (!err.response || [502, 504].includes(err.response.status) || err.response?.data?.resultCode === '9999') {
    throw new NotConnectedError();
  }

  return Promise.reject(err);
});

export const requestClient = client as AxiosInstance;
