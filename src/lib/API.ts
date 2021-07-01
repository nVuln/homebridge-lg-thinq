import * as constants from './constants';
import { URL } from 'url';

import {Session} from './Session';
import {Gateway} from './Gateway';

import {requestClient} from './request';
import {Auth} from './Auth';
import {WorkId} from './ThinQ';
import {TokenError} from '../errors/TokenError';
import {MonitorError} from '../errors/MonitorError';
import {NotConnectedError} from '../errors/NotConnectedError';

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

  constructor(
    protected country: string = 'US',
    protected language: string = 'en-US',
  ) {}

  public async getDeviceInfo(device_id: string) {
    const headers = this.defaultHeaders;
    const deviceUrl = resolveUrl(this._gateway?.thinq2_url, 'service/devices/' + device_id);

    return requestClient.get(deviceUrl, { headers }).then(res => res.data.result);
  }

  public async getListDevices() {
    const homes = await this.getListHomes();
    const headers = this.defaultHeaders;
    const devices: Record<string, any>[] = [];

    // get all devices in home
    for (let i = 0; i < homes.length; i++) {
      const homeUrl = resolveUrl(this._gateway?.thinq2_url, 'service/homes/' + homes[i].homeId);
      const resp = await requestClient.get(homeUrl, { headers }).then(res => res.data);

      devices.push(...resp.result.devices);
    }

    return devices;
  }

  public async getDeviceModelInfo(device) {
    return await requestClient.get(device.modelJsonUri).then(res => res.data);
  }

  public async getListHomes() {
    if (!this._homes) {
      const headers = this.defaultHeaders;
      const homesUrl = resolveUrl(this._gateway?.thinq2_url, 'service/homes');
      this._homes = await requestClient.get(homesUrl, { headers }).then(res => res.data).then(data => data.result.item);
    }

    return this._homes;
  }

  public async sendCommandToDevice(device_id: string, values: Record<string, any>) {
    const headers = this.defaultHeaders;
    const controlUrl = resolveUrl(this._gateway?.thinq2_url, 'service/devices/'+device_id+'/control-sync');
    return requestClient.post(controlUrl, {
      'ctrlKey': 'basicCtrl',
      'command': 'Set',
      ...values,
    }, { headers }).then(resp => resp.data);
  }

  public async sendMonitorCommand(deviceId: string, cmdOpt: string, workId: WorkId) {
    const headers = this.monitorHeaders;
    const data = {
      cmd: 'Mon',
      cmdOpt,
      deviceId,
      workId,
    };
    return await requestClient.post(this._gateway?.thinq1_url + 'rti/rtiMon', { lgedmRoot: data }, { headers })
      .then(res => res.data.lgedmRoot)
      .then(data => {
        if ('returnCd' in data) {
          const code = data.returnCd as string;
          if (code === '0106') {
            throw new NotConnectedError(data.returnMsg || '');
          } else if (code !== '0000') {
            throw new TokenError(code + ' - ' + data.returnMsg || '');
          }
        }

        return data;
      });
  }

  public async getMonitorResult(device_id, work_id) {
    const headers = this.monitorHeaders;
    const workList = [{ deviceId: device_id, workId: work_id }];
    return await requestClient.post(this._gateway?.thinq1_url + 'rti/rtiResult', { lgedmRoot: { workList } }, { headers })
      .then(resp => resp.data.lgedmRoot)
      .then(data => {
        if ('returnCd' in data) {
          const code = data.returnCd as string;
          if (code === '0106') {
            throw new NotConnectedError(data.returnMsg || '');
          } else if (code !== '0000') {
            throw new TokenError(code + ' - ' + data.returnMsg || '');
          }
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
    this.session = new Session(refreshToken, refreshToken, 0);
  }

  public setUsernamePassword(username, password) {
    this.username = username;
    this.password = password;
  }

  public async gateway() {
    if (!this._gateway) {
      const gateway = await requestClient.get(constants.GATEWAY_URL, { headers: this.defaultHeaders }).then(res => res.data.result);
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
    }

    if (!this.session.hasValidToken() && !!this.session.refreshToken) {
      this.session = await this.auth.refreshNewToken(this.session);
    }

    if (!this.userNumber) {
      this.userNumber = await this.auth.getUserNumber(this.session?.accessToken);
    }
  }

  public async refreshNewToken() {
    if (!this.session || !this.auth) {
      throw Error('API session not ready, try it again.');
    }

    await this.auth.refreshNewToken(this.session);
  }

  protected get monitorHeaders() {
    return {
      'Accept': 'application/json',
      'x-thinq-token': this.session?.accessToken,
      'x-thinq-jsessionId': this.auth.jsessionId,
      'x-thinq-application-key': 'wideq',
      'x-thinq-security-key': 'nuts_securitykey',
    };
  }

  protected get defaultHeaders() {
    function random_string(length: number) {
      const result: string[] = [];
      const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      const charactersLength = characters.length;
      for ( let i = 0; i < length; i++ ) {
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

    return {
      'x-api-key': constants.API_KEY,
      'x-client-id': constants.API_CLIENT_ID,
      'x-thinq-app-ver': '3.5.1700',
      'x-thinq-app-type': 'NUTS',
      'x-thinq-app-level': 'PRD',
      'x-thinq-app-os': 'ANDROID',
      'x-thinq-app-logintype': 'LGE',
      'x-service-code': 'SVC202',
      'x-country-code': this.country,
      'x-language-code': this.language,
      'x-service-phase': 'OP',
      'x-origin': 'app-native',
      'x-model-name': 'samsung / SM-N950N',
      'x-os-version': '7.1.2',
      'x-app-version': '3.5.1721',
      'x-message-id': random_string(22),
      ...headers,
    };
  }
}
