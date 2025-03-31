import * as constants from './constants';
import { URL } from 'url';

import { Session } from './Session';
import { Gateway } from './Gateway';

import { requestClient } from './request';
import { Auth } from './Auth';
import { WorkId } from './ThinQ';
import { ManualProcessNeeded, MonitorError, NotConnectedError, TokenExpiredError } from '../errors';
import crypto from 'crypto';
import axios, { Method } from 'axios';
import { Logger } from 'homebridge';


/**
 * The `API` class provides methods to interact with the LG ThinQ API, enabling
 * device management, home management, and command execution. It handles
 * authentication, session management, and API requests with appropriate headers.
 *
 * @remarks
 * This class includes methods for sending commands to devices, retrieving device
 * and home information, and managing authentication tokens. It supports both
 * ThinQ1 and ThinQ2 APIs.
 *
 * @example
 * ```typescript
 * const api = new API('US', 'en-US', logger);
 * api.setUsernamePassword('username', 'password');
 * await api.ready();
 * const devices = await api.getListDevices();
 * console.log(devices);
 * ```
 *
 * @param country - The country code (default: 'US').
 * @param language - The language code (default: 'en-US').
 * @param logger - The logger instance for logging debug and error messages.
 */
export class API {
  protected _homes: any;
  protected _gateway: Gateway | undefined;
  protected session: Session = new Session('', '', 0);
  protected jsessionId!: string;
  protected auth!: Auth;
  protected userNumber!: string;

  protected username!: string;
  protected password!: string;

  public client_id!: string;

  public httpClient = requestClient;

  constructor(
    protected country: string = 'US',
    protected language: string = 'en-US',
    protected logger: Logger,
  ) {
  }

  /**
   * Sends a GET request to the specified URI.
   *
   * @param uri - The URI to send the GET request to.
   * @returns A promise resolving to the response data.
   * @throws Error if the URI is invalid.
   */
  async getRequest(uri: string) {
    if (typeof uri !== 'string' || !uri.trim()) {
      this.logger.error('Invalid URI: ', uri);
      throw new Error('Invalid URI: URI must be a non-empty string.');
    }
    return await this.request('get', uri);
  }

  /**
   * Sends a POST request to the specified URI with the provided data.
   *
   * @param uri - The URI to send the POST request to.
   * @param data - The data to include in the POST request.
   * @returns A promise resolving to the response data.
   */
  async postRequest(uri: string, data: any) {
    return await this.request('post', uri, data);
  }

  resolveUrl(from: string, to: string) {
    const url = new URL(to, from);
    return url.href;
  }

  /**
   * Sends an HTTP request to the ThinQ API.
   *
   * @param method - The HTTP method ('get' or 'post').
   * @param uri - The URI to send the request to.
   * @param data - Optional data to include in the request.
   * @param retry - Whether to retry the request in case of token expiration.
   * @returns A promise resolving to the response data.
   */
  protected async request(method: Method | undefined, uri: string, data?: any, retry = false): Promise<any> {
    const gateway = await this.gateway();
    // Determine the appropriate headers based on the URI
    const requestHeaders = (gateway.thinq1_url && uri.startsWith(gateway.thinq1_url))
      ? this.monitorHeaders
      : this.defaultHeaders;

    const url = this.resolveUrl(gateway.thinq2_url, uri);

    return await this.httpClient.request({
      method,
      url,
      data,
      headers: requestHeaders,
    }).then(res => res.data).catch(async err => {
      // Handle token expiration and retry the request
      if (err instanceof TokenExpiredError && !retry) {
        return await this.refreshNewToken().then(async () => {
          return await this.request(method, uri, data, true);
        }).catch((err) => {
          this.logger.error('refresh new token error: ', err);
          return {};
        });
      } else if (err instanceof ManualProcessNeeded) {
        // Handle manual process errors (e.g., new terms agreement)
        this.logger.warn('Handling new term agreement... If you keep getting this message, ' + err.message);
        await this.auth.handleNewTerm(this.session.accessToken)
          .then(() => {
            this.logger.warn('LG new term agreement is accepted.');
          })
          .catch(err => {
            this.logger.error(err);
          });

        if (!retry) {
          // Retry the request once
          return await this.request(method, uri, data, true);
        } else {
          return {};
        }
      } else {
        // Log other errors
        if (axios.isAxiosError(err)) {
          this.logger.error('request error: ', err.response);
        } else if (!(err instanceof NotConnectedError)) {
          this.logger.error('request error: ', err);
        }

        return {};
      }
    });
  }

  protected get monitorHeaders() {
    const monitorHeaders: Record<string,string> = {
      'Accept': 'application/json',
      'x-thinq-application-key': 'wideq',
      'x-thinq-security-key': 'nuts_securitykey',
    };

    if (typeof this.session?.accessToken === 'string') {
      monitorHeaders['x-thinq-token'] = this.session?.accessToken;
    }

    if (this.jsessionId) {
      monitorHeaders['x-thinq-jsessionId'] = this.jsessionId;
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

    const headers: Record<string,string> = {};
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

  /**
   * Retrieves the list of devices associated with the user's account.
   *
   * @returns A promise resolving to an array of devices.
   */
  public async getListDevices() {
    const homes = await this.getListHomes();
    const devices: Record<string, any>[] = [];

    // Retrieve devices for each home
    for (let i = 0; i < homes.length; i++) {
      const resp = await this.getRequest('service/homes/' + homes[i].homeId);
      devices.push(...resp.result.devices);
    }

    return devices;
  }

  /**
   * Retrieves the list of homes associated with the user's account.
   *
   * @returns A promise resolving to an array of homes.
   */
  public async getListHomes() {
    if (!this._homes) {
      this._homes = await this.getRequest('service/homes').then(data => data.result.item);
    }

    return this._homes;
  }

  /**
   * Sends a command to a specific device.
   *
   * @param device_id - The ID of the device to send the command to.
   * @param values - The command values to send.
   * @param command - The type of command ('Set' or 'Operation').
   * @param ctrlKey - The control key (default: 'basicCtrl').
   * @param ctrlPath - The control path (default: 'control-sync').
   * @returns A promise resolving to the response of the command.
   * @throws Error if `device_id` is not a valid non-empty string.
   */
  public async sendCommandToDevice(
    device_id: string,
    values: Record<string, any>,
    command: 'Set' | 'Operation',
    ctrlKey = 'basicCtrl',
    ctrlPath = 'control-sync',
  ) {
    if (typeof device_id !== 'string' || !device_id.trim()) {
      throw new Error('Invalid device_id: must be a non-empty string.');
    }
    if (typeof command !== 'string' || !['Set', 'Operation'].includes(command)) {
      throw new Error('Invalid command: must be "Set" or "Operation".');
    }
    return await this.postRequest('service/devices/' + device_id + '/' + ctrlPath, {
      ctrlKey,
      'command': command,
      ...values,
    });
  }

  /**
   * Sends a monitor command to a specific device.
   *
   * @param deviceId - The ID of the device to monitor.
   * @param cmdOpt - The command option for monitoring.
   * @param workId - The work ID associated with the monitoring command.
   * @returns A promise resolving to the response of the monitor command.
   * @throws Error if `deviceId` or `cmdOpt` is not a valid non-empty string.
   */
  public async sendMonitorCommand(deviceId: string, cmdOpt: string, workId: WorkId) {
    if (typeof deviceId !== 'string' || !deviceId.trim()) {
      throw new Error('Invalid deviceId: must be a non-empty string.');
    }
    if (typeof cmdOpt !== 'string' || !cmdOpt.trim()) {
      throw new Error('Invalid cmdOpt: must be a non-empty string.');
    }
    const data = {
      cmd: 'Mon',
      cmdOpt,
      deviceId,
      workId,
    };

    return await this.thinq1PostRequest('rti/rtiMon', data);
  }

  /**
   * Retrieves the monitor result for a specific device and work ID.
   *
   * @param device_id - The ID of the device.
   * @param work_id - The work ID associated with the monitor result.
   * @returns A promise resolving to the monitor result or null if not available.
   * @throws Error if `device_id` or `work_id` is not a valid non-empty string.
   */
  public async getMonitorResult(device_id: string, work_id: string) {
    if (typeof device_id !== 'string' || !device_id.trim()) {
      throw new Error('Invalid device_id: must be a non-empty string.');
    }
    if (typeof work_id !== 'string' || !work_id.trim()) {
      throw new Error('Invalid work_id: must be a non-empty string.');
    }

    return await this.thinq1PostRequest('rti/rtiResult', { workList: [{ deviceId: device_id, workId: work_id }] })
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

  public setRefreshToken(refreshToken: string) {
    if (typeof refreshToken !== 'string' || !refreshToken.trim()) {
      throw new Error('Invalid refreshToken: refreshToken must be a non-empty string.');
    }
    this.session = new Session('', refreshToken, 0);
  }

  public setUsernamePassword(username: string, password: string) {
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
      this.auth = new Auth(gateway, this.logger);
      this.auth.logger = this.logger;
    }

    if (!this.session.hasToken() && this.username && this.password) {
      this.session = await this.auth.login(this.username, this.password);
      await this.refreshNewToken(this.session);
    }

    if (!this.session.hasValidToken() && !!this.session.refreshToken) {
      await this.refreshNewToken(this.session);
    }

    if (!this.jsessionId) {
      // get new jsessionid
      this.jsessionId = await this.auth.getJSessionId(this.session.accessToken);
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

    this.jsessionId = await this.auth.getJSessionId(this.session.accessToken);
  }

  async thinq1PostRequest(endpoint: string, data: any) {
    return await this.postRequest(this._gateway?.thinq1_url + endpoint, {
      lgedmRoot: data,
    }).then(data => data.lgedmRoot);
  }
}
