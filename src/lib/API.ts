import * as constants from './constants';
import { URL } from 'url';
import * as qs from 'qs';
import { DateTime } from 'luxon';
import crypto from 'crypto';

import axios, { AxiosInstance } from 'axios';
import {Session} from './Session';
import {AuthenticationError} from '../errors/AuthenticationError';
import {TokenError} from '../errors/TokenError';
import {Gateway} from './Gateway';

const client = axios.create();

export const requestClient = client as AxiosInstance;

function resolveUrl(from, to) {
  const url = new URL(to, from);
  return url.href;
}

export class API {
  protected _homes;
  protected gateway: Gateway | undefined;
  protected session: Session | undefined;
  protected userNumber!: string;
  protected lgeapi_url!: string;

  constructor(
    protected country: string,
    protected language: string,
    protected username: string,
    protected password: string,
  ) {}

  protected async login() {
    const loginForm = await requestClient.get(await this.getLoginUrl()).then(res => res.data);
    const headers = {
      'Accept': 'application/json',
      'X-Application-Key': constants.APPLICATION_KEY,
      'X-Client-App-Key': constants.CLIENT_ID,
      'X-Lge-Svccode': 'SVC709',
      'X-Device-Type': 'M01',
      'X-Device-Platform': 'ADR',
      'X-Device-Language-Type': 'IETF',
      'X-Device-Publish-Flag': 'Y',
      'X-Device-Country': this.country,
      'X-Device-Language': this.language,
      'X-Signature': loginForm.match(/signature\s+:\s+"([^"]+)"/)[1],
      'X-Timestamp': loginForm.match(/tStamp\s+:\s+"([^"]+)"/)[1],
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
    };

    const hash = crypto.createHash('sha512');
    const data = {
      'user_auth2': hash.update(this.password).digest('hex'),
      'itg_terms_use_flag': 'Y',
      'svc_list': 'SVC202,SVC710', // SVC202=LG SmartHome, SVC710=EMP OAuth
    };

    const loginUrl = resolveUrl(this.gateway?.emp_base_url, 'emp/v2.0/account/session/' + encodeURIComponent(this.username));
    const res = await requestClient.post(loginUrl, qs.stringify(data), { headers }).then(res => res.data).catch(err => {
      const {code, message} = err.response.data.error;
      if (code === 'MS.001.03') {
        throw new AuthenticationError('Double-check your country in configuration');
      }

      throw new AuthenticationError(message);
    });

    // get secret key for emp signature
    const empSearchKeyUrl = resolveUrl(this.gateway?.login_base_url, 'searchKey?key_name=OAUTH_SECRETKEY&sever_type=OP');
    const secretKey = await requestClient.get(empSearchKeyUrl).then(res => res.data).then(data => data.returnData);

    const timestamp = DateTime.utc().toRFC2822();
    const empData = {
      account_type: res.account.userIDType,
      client_id: constants.CLIENT_ID,
      country_code: res.account.country,
      username: res.account.userID,
    };
    const empUrl = '/emp/oauth2/token/empsession' + qs.stringify(empData, { addQueryPrefix: true });
    const signature = this.signature(`${empUrl}\n${timestamp}`, secretKey);
    const empHeaders = {
      'lgemp-x-app-key': constants.OAUTH_CLIENT_KEY,
      'lgemp-x-date': timestamp,
      'lgemp-x-session-key': res.account.loginSessionID,
      'lgemp-x-signature': signature,
      'Accept': 'application/json',
      'X-Device-Type': 'M01',
      'X-Device-Platform': 'ADR',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Access-Control-Allow-Origin': '*',
      'Accept-Encoding': 'gzip, deflate, br',
      'Accept-Language': 'en-US,en;q=0.9',
    };
    const token = await requestClient.post('https://emp-oauth.lgecloud.com/emp/oauth2/token/empsession', qs.stringify(empData), {
      headers: empHeaders,
    }).then(res => res.data).catch(err => {
      throw new AuthenticationError(err.response.data.error.message);
    });
    if (token.status !== 1) {
      throw new TokenError(token.message);
    }

    this.lgeapi_url = token.oauth2_backend_url || `https://${this.country.toLowerCase()}.lgeapi.com/`;

    return new Session(token.access_token, token.refresh_token, token.expires_in);
  }

  public async getLoginUrl() {
    const params = {
      country: this.country,
      language: this.language,
      client_id: constants.CLIENT_ID,
      svc_list: constants.SVC_CODE,
      svc_integrated: 'Y',
      redirect_uri: this.gateway?.login_base_url + 'login/iabClose',
      show_thirdparty_login: 'LGE,MYLG',
      division: 'ha:T20',
      callback_url: this.gateway?.login_base_url + 'login/iabClose',
    };

    return resolveUrl(this.gateway?.login_base_url, 'login/signIn' + qs.stringify(params, { addQueryPrefix: true }));
  }

  public async getDeviceInfo(device_id: string) {
    const headers = this.defaultHeaders;
    const deviceUrl = resolveUrl(this.gateway?.thinq2_url, 'service/devices/' + device_id);

    return requestClient.get(deviceUrl, { headers }).then(res => res.data.result);
  }

  public async getListDevices() {
    const homes = await this.getListHomes();
    const headers = this.defaultHeaders;
    const devices: Record<string, any>[] = [];

    // get all devices in home
    for (let i = 0; i < homes.length; i++) {
      const homeUrl = resolveUrl(this.gateway?.thinq2_url, 'service/homes/' + homes[i].homeId);
      const resp = await requestClient.get(homeUrl, { headers }).then(res => res.data);

      // filter thinq2 device only
      const thinq2devices = resp.result.devices.filter(device => {
        return device.platformType === 'thinq2';
      });
      devices.push(...thinq2devices);
    }

    return devices;
  }

  public async getDeviceModelInfo(device) {
    return await requestClient.get(device.modelJsonUri).then(res => res.data);
  }

  public async getListHomes() {
    if (!this._homes) {
      const headers = this.defaultHeaders;
      const homesUrl = resolveUrl(this.gateway?.thinq2_url, 'service/homes');
      this._homes = await requestClient.get(homesUrl, { headers }).then(res => res.data).then(data => data.result.item);
    }

    return this._homes;
  }

  public async sendCommandToDevice(device_id: string, values: Record<string, any>) {
    const headers = this.defaultHeaders;
    const controlUrl = resolveUrl(this.gateway?.thinq2_url, 'service/devices/'+device_id+'/control-sync');
    return requestClient.post(controlUrl, {
      'ctrlKey': 'basicCtrl',
      'command': 'Set',
      ...values,
    }, { headers }).then(resp => resp.data);
  }

  public signature(message, secret) {
    return crypto.createHmac('sha1', Buffer.from(secret)).update(message).digest('base64');
  }

  public async ready() {
    // get gateway first
    if (!this.gateway) {
      const gateway = await requestClient.get(constants.GATEWAY_URL, { headers: this.defaultHeaders }).then(res => res.data.result);
      this.gateway = new Gateway(gateway);
    }

    if (!this.session?.hasToken()) {
      this.session = await this.login();
    }

    if (!this.session.hasValidToken()) {
      await this.refreshNewToken();
    }

    if (!this.userNumber) {
      this.userNumber = await this.getUserNumber();
    }
  }

  public async refreshNewToken() {
    const tokenUrl = resolveUrl(this.lgeapi_url, 'oauth2/token');
    const data = {
      grant_type: 'refresh_token',
      refresh_token: this.session?.refreshToken,
    };

    const timestamp = DateTime.utc().toRFC2822();

    const requestUrl = '/oauth2/token' + qs.stringify(data, { addQueryPrefix: true });
    const signature = this.signature(`${requestUrl}\n${timestamp}`, constants.OAUTH_SECRET_KEY);

    const headers = {
      'lgemp-x-app-key': constants.CLIENT_ID,
      'lgemp-x-signature': signature,
      'lgemp-x-date': timestamp,
      'Accept': 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    };
    const resp = await requestClient.post(tokenUrl, qs.stringify(data), { headers }).then(resp => resp.data);

    this.session?.newToken(resp.access_token, resp.expiredIn);
  }

  protected async getUserNumber() {
    const profileUrl = resolveUrl(this.lgeapi_url, 'users/profile');
    const timestamp = DateTime.utc().toRFC2822();
    const signature = this.signature(`/users/profile\n${timestamp}`, constants.OAUTH_SECRET_KEY);

    const headers = {
      'Accept': 'application/json',
      'Authorization': 'Bearer ' + this.session?.accessToken,
      'X-Lge-Svccode': 'SVC202',
      'X-Application-Key': constants.APPLICATION_KEY,
      'lgemp-x-app-key': constants.CLIENT_ID,
      'X-Device-Type': 'M01',
      'X-Device-Platform': 'ADR',
      'x-lge-oauth-date': timestamp,
      'x-lge-oauth-signature': signature,
    };

    const resp = await requestClient.get(profileUrl, { headers }).then(resp => resp.data);
    return resp.account.userNo as string;
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
    if (this.session?.accessToken) {
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
