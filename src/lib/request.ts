import axios, {AxiosInstance} from 'axios';

const client = axios.create();

export const requestClient = client as AxiosInstance;
