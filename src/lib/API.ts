import * as constants from './constants';
import {URL} from 'url';

import {Session} from './Session';
import {Gateway} from './Gateway';

import {requestClient} from './request';
import {Auth} from './Auth';
import {WorkId} from './ThinQ';
import {ManualProcessNeeded, MonitorError, NotConnectedError, TokenExpiredError} from '../errors';
import crypto from 'crypto';
import axios from 'axios';

function resolveUrl(from, to) {
  const url = new URL(to, from);
  return url.href;
}

export class API {
  protected _homes;
  protected _gateway: Gateway | undefined;
  protected session: Session = new Session('', '', 0);
  protected auth!: Auth;
  protected userNumber!: string;

  protected username!: string;
  protected password!: string;

  public client_id!: string;

  public httpClient = requestClient;

  public logger;

  constructor(
    protected country: string = 'US',
    protected language: string = 'en-US',
  ) {
    this.logger = console;
  }

  async getRequest(uri, headers?: any) {
    return await this.request('get', uri, headers);
  }

  async postRequest(uri, data, headers?: any) {
    return await this.request('post', uri, data, headers);
  }

  protected async request(method, uri: string, data?: any, headers?: any, retry = false) {
    let requestHeaders = headers || this.defaultHeaders;
    if (this._gateway?.thinq1_url && uri.startsWith(this._gateway.thinq1_url)) {
      requestHeaders = headers || this.monitorHeaders;
    }

    const url = resolveUrl(this._gateway?.thinq2_url, uri);

    return await this.httpClient.request({
      method, url, data,
      headers: requestHeaders,
    }).then(res => res.data).catch(async err => {
      if (err instanceof TokenExpiredError && !retry) {
        return await this.refreshNewToken().then(async () => {
          return await this.request(method, uri, data, headers, true);
        }).catch((err) => {
          this.logger.debug('refresh new token error: ', err);
          return {};
        });
      } else {
        if (err instanceof ManualProcessNeeded) {
          this.logger.warn(err.message);
        } else if (axios.isAxiosError(err)) {
          this.logger.debug('request error: ', err.response);
        } else if (!(err instanceof NotConnectedError)) {
          this.logger.debug('request error: ', err);
        }

        return {};
      }
    });
  }

  protected get monitorHeaders() {
    const monitorHeaders = {
      'Accept': 'application/json',
      'x-thinq-application-key': 'wideq',
      'x-thinq-security-key': 'nuts_securitykey',
    };

    if (typeof this.session?.accessToken === 'string') {
      monitorHeaders['x-thinq-token'] = this.session?.accessToken;
    }

    if (typeof this.auth?.jsessionId === 'string') {
      monitorHeaders['x-thinq-jsessionId'] = this.auth?.jsessionId;
    }

    return monitorHeaders;
  }

  protected get defaultHeaders() {
    function random_string(length: number) {
      const result: string[] = [];
      const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      const charactersLength = characters.length;
      for (let i = 0; i < length; i++) {
        result.push(characters.charAt(Math.floor(Math.random() * charactersLength)));
      }
      return result.join('');
    }

    const headers = {};
    if (this.session.accessToken) {
      headers['x-emp-token'] = this.session.accessToken;
    }

    if (this.userNumber) {
      headers['x-user-no'] = this.userNumber;
    }

    headers['x-client-id'] = this.client_id || constants.API_CLIENT_ID;

    return {
      'x-api-key': constants.API_KEY,
      'x-thinq-app-ver': '3.6.1200',
      'x-thinq-app-type': 'NUTS',
      'x-thinq-app-level': 'PRD',
      'x-thinq-app-os': 'ANDROID',
      'x-thinq-app-logintype': 'LGE',
      'x-service-code': 'SVC202',
      'x-country-code': this.country,
      'x-language-code': this.language,
      'x-service-phase': 'OP',
      'x-origin': 'app-native',
      'x-model-name': 'samsung/SM-G930L',
      'x-os-version': 'AOS/7.1.2',
      'x-app-version': 'LG ThinQ/3.6.12110',
      'x-message-id': random_string(22),
      'user-agent': 'okhttp/3.14.9',
      ...headers,
    };
  }

  public async getSingleDevice(device_id: string) {
    return await this.getRequest('service/devices/' + device_id).then(data => data.result);
  }

  public async getListDevices() {
    const homes = await this.getListHomes();
    const devices: Record<string, any>[] = [];

    // get all devices in home
    for (let i = 0; i < homes.length; i++) {
      const resp = await this.getRequest('service/homes/' + homes[i].homeId);

      devices.push(...resp.result.devices);
    }

    return devices;
  }

  public async getListHomes() {
    if (!this._homes) {
      this._homes = await this.getRequest('service/homes').then(data => data.result.item);
    }

    return this._homes;
  }

  public async sendCommandToDevice(device_id: string, values: Record<string, any>, command: 'Set' | 'Operation', ctrlKey = 'basicCtrl') {
    return await this.postRequest('service/devices/' + device_id + '/control-sync', {
      ctrlKey,
      'command': command,
      ...values,
    });
  }

  public async sendMonitorCommand(deviceId: string, cmdOpt: string, workId: WorkId) {
    const data = {
      cmd: 'Mon',
      cmdOpt,
      deviceId,
      workId,
    };

    return await this.thinq1PostRequest('rti/rtiMon', data);
  }

  public async getMonitorResult(device_id, work_id) {
    return await this.thinq1PostRequest('rti/rtiResult', {workList: [{deviceId: device_id, workId: work_id}]})
      .then(data => {
        if (!('workList' in data) || !('returnCode' in data.workList)) {
          return null;
        }

        const workList = data.workList;
        if (workList.returnCode !== '0000') {
          throw new MonitorError(data);
        }

        if (!('returnData' in workList)) {
          return null;
        }

        return Buffer.from(workList.returnData, 'base64');
      });
  }

  public setRefreshToken(refreshToken) {
    this.session = new Session('', refreshToken, 0);
  }

  public setUsernamePassword(username, password) {
    this.username = username;
    this.password = password;
  }

  public async gateway() {
    if (!this._gateway) {
      const gateway = await requestClient.get(constants.GATEWAY_URL, {headers: this.defaultHeaders}).then(res => res.data.result);
      this._gateway = new Gateway(gateway);
    }

    return this._gateway;
  }

  public async ready() {
    // get gateway first
    const gateway = await this.gateway();

    if (!this.auth) {
      this.auth = new Auth(gateway);
    }

    if (!this.session.hasToken() && this.username && this.password) {
      this.session = await this.auth.login(this.username, this.password);
      // get new jsessionid
      await this.auth.getJSessionId(this.session.accessToken);
    }

    if (!this.session.hasValidToken() && !!this.session.refreshToken) {
      await this.refreshNewToken(this.session);
    }

    if (!this.userNumber) {
      this.userNumber = await this.auth.getUserNumber(this.session?.accessToken);
    }

    if (!this.client_id) {
      const hash = crypto.createHash('sha256');
      this.client_id = hash.update(this.userNumber + (new Date()).getTime()).digest('hex');
    }
  }

  public async refreshNewToken(session: Session | null = null) {
    session = session || this.session;
    this.session = await this.auth.refreshNewToken(session);
    // get new jsessionid
    await this.auth.getJSessionId(this.session.accessToken);
  }

  async thinq1PostRequest(endpoint: string, data: any) {
    const headers = this.monitorHeaders;
    return await this.postRequest(this._gateway?.thinq1_url + endpoint, {
      lgedmRoot: data,
    }, headers).then(data => data.lgedmRoot);
  }
}
