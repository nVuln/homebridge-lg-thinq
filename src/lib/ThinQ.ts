import { Logger, PlatformConfig } from 'homebridge';
import { API } from './API.js';
import { LGThinQHomebridgePlatform } from '../platform.js';
import { Device, devicesFromList } from './Device.js';
import { PlatformType } from './constants.js';
import { DeviceModel, loadDeviceModelForDevice } from './DeviceModel.js';
import * as Path from 'path';
import Helper from '../v1/helper.js';
import { PLUGIN_NAME } from '../settings.js';
import { device as awsIotDevice } from 'aws-iot-device-sdk';
import Persist from './Persist.js';
import { coerceCommandPayload } from './commandPayload.js';
import {
  loadMqttConnectionSetup,
  prepareMqttConnection,
  retryMqttRegistration,
} from './mqttCertificate.js';
import { wireMqttDeviceEvents } from './mqttConnection.js';
import {
  pollThinQ1MonitorResult,
  registerThinQ1WorkId,
  unregisterThinQ1WorkId,
  WorkIdRegistry,
} from './thinq1Monitor.js';

export type WorkId = string;

export class ThinQ {
  protected api: API;
  protected workIds: WorkIdRegistry = {};
  protected deviceModel: Record<string, DeviceModel> = {};
  protected persist;
  constructor(
    public readonly platform: LGThinQHomebridgePlatform,
    public readonly config: PlatformConfig,
    public readonly logger: Logger,
  ) {
    this.api = new API(this.config.country, this.config.language, logger);
    this.api.httpClient.interceptors.response.use(response => {
      this.logger.debug('[request]', response.config.method, response.config.url);
      return response;
    }, err => {
      return Promise.reject(err);
    });

    if (config.refresh_token) {
      this.api.setRefreshToken(config.refresh_token);
    } else if (config.username && config.password) {
      this.api.setUsernamePassword(config.username, config.password);
    }

    this.persist = new Persist(Path.join(this.platform.api.user.storagePath(), PLUGIN_NAME, 'persist', 'devices'));
  }

  public async devices() {
    const listDevices = await this.api.getListDevices();

    return devicesFromList(listDevices);
  }

  public async setup(device: Device) {
    // load device model
    device.deviceModel = await this.loadDeviceModel(device);

    if (device.deviceModel.data.Monitoring === undefined
      && device.deviceModel.data.MonitoringValue === undefined
      && device.deviceModel.data.Value === undefined) {
      this.logger.warn('[' + device.name + '] This device may not "smart" device. Ignore it!');
    }

    if (device.platform === PlatformType.ThinQ1) {
      // register work uuid
      await this.registerWorkId(device);

      // transform thinq1 device
      const deviceWithSnapshot = Helper.transform(device, null);
      device.snapshot = deviceWithSnapshot.snapshot;
    }

    return true;
  }

  public async unregister(device: Device) {
    if (device.platform === PlatformType.ThinQ1) {
      await unregisterThinQ1WorkId({
        api: this.api,
        workIds: this.workIds,
        device,
      });
    }
  }

  protected async registerWorkId(device: any) {
    return await registerThinQ1WorkId({
      api: this.api,
      workIds: this.workIds,
      device,
    });
  }

  protected async loadDeviceModel(device: Device) {
    return this.deviceModel[device.id] = await loadDeviceModelForDevice({
      device,
      persist: this.persist,
      httpClient: this.api.httpClient,
      logger: this.logger,
    });
  }

  public async pollMonitor(device: Device) {
    device.deviceModel = await this.loadDeviceModel(device);

    if (device.platform === PlatformType.ThinQ1) {
      const result = await pollThinQ1MonitorResult({
        api: this.api,
        workIds: this.workIds,
        device,
      });
      return Helper.transform(device, result);
    }

    return device;
  }

  public thinq1DeviceControl(device: Device, key: string, value: any) {
    const data = Helper.prepareControlData(device, key, value);

    return this.api.thinq1PostRequest('rti/rtiControl', data).catch(err => {
      this.logger.error('Unknown Error: ', err);
    });
  }

  public async deviceControl(
    device: string | Device, values: Record<string, any>,
    command: 'Set' | 'Operation' = 'Set', ctrlKey = 'basicCtrl', ctrlPath = 'control-sync') {
    const id = device instanceof Device ? device.id : device;
    const model: DeviceModel | undefined = this.deviceModel[id];

    coerceCommandPayload(values, model);

    const response = await this.api.sendCommandToDevice(id, values, command, ctrlKey, ctrlPath);
    if (response.resultCode === '0000') {
      this.logger.debug('ThinQ Device Received the Command');
      return true;
    } else {
      this.logger.debug('ThinQ Device Did Not Received the Command');
      return false;
    }
  }

  public async registerMQTTListener(callback: (data: any) => void) {
    await retryMqttRegistration({
      register: () => this._registerMQTTListener(callback),
      logger: this.logger,
    });
  }

  protected async _registerMQTTListener(callback: (data: any) => void) {
    const setup = await loadMqttConnectionSetup({
      api: this.api,
      persist: this.persist,
      logger: this.logger,
    });

    const connectToMqtt = async () => {
      const mqttDir = Path.join(this.platform.api.user.storagePath(), PLUGIN_NAME, 'persist', 'mqtt');
      const connection = await prepareMqttConnection({
        api: this.api,
        setup,
        mqttDir,
        clientId: this.api.client_id,
      });

      this.logger.debug('open mqtt connection to', setup.mqttServer);
      const device = new awsIotDevice(connection.connectData);

      wireMqttDeviceEvents({
        device,
        logger: this.logger,
        mqttServer: setup.mqttServer,
        subscriptions: connection.subscriptions,
        onMessage: callback,
        reconnect: connectToMqtt,
      });
    };

    // first call
    await connectToMqtt();
  }

  public async isReady() {
    await this.persist.init();
    await this.api.ready();
  }
}
