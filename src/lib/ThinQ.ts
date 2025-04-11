import { Logger, PlatformConfig } from 'homebridge';
import { API } from './API.js';
import { LGThinQHomebridgePlatform } from '../platform.js';
import { Device, DeviceData } from './Device.js';
import { DeviceType, PlatformType } from './constants.js';
import { v4 } from 'uuid';
import * as Path from 'path';
import * as forge from 'node-forge';
import { DeviceModel } from './DeviceModel.js';
import Helper from '../v1/helper.js';
import { MonitorError, NotConnectedError } from '../errors/index.js';
import { PLUGIN_NAME } from '../settings.js';
import { device as awsIotDevice } from 'aws-iot-device-sdk';
import { URL } from 'url';
import Persist from './Persist.js';

export type WorkId = string;

export class ThinQ {
  protected api: API;
  protected workIds: Record<string, WorkId> = {};
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
    const listDevices = await this.api.getListDevices().catch(() => {
      return [];
    });

    return listDevices.map(device => new Device(device as DeviceData))
      // skip all device invalid id
      .filter(device => device.id.match(/^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/));
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
    if (device.platform === PlatformType.ThinQ1 && device.id in this.workIds && this.workIds[device.id] !== null) {
      try {
        await this.api.sendMonitorCommand(device.id, 'Stop', this.workIds[device.id]);
      } catch (err) {
        //this.log.error(err);
      }

      delete this.workIds[device.id];
    }
  }

  protected async registerWorkId(device: any) {
    return this.workIds[device.id] = await this.api.sendMonitorCommand(device.id, 'Start', v4()).then(data => {
      if (data !== undefined && 'workId' in data) {
        return data.workId;
      }

      return null;
    });
  }

  protected async loadDeviceModel(device: Device) {
    let deviceModel = await this.persist.getItem(device.id);
    if (!deviceModel) {
      this.logger.debug('[' + device.id + '] Device model cache missed.');
      deviceModel = await this.api.httpClient.get(device.data.modelJsonUri).then(res => res.data);
      await this.persist.setItem(device.id, deviceModel);
    }

    const modelVersion = parseFloat(deviceModel.Info?.version);
    // new washer model
    if (device.type === DeviceType[DeviceType.WASH_TOWER_2]
      && modelVersion && modelVersion >= 3
      && deviceModel.Info?.defaultTargetDeviceRoot
      && deviceModel[deviceModel.Info.defaultTargetDeviceRoot]
    ) {
      deviceModel = deviceModel[deviceModel.Info.defaultTargetDeviceRoot];
    }

    return this.deviceModel[device.id] = device.deviceModel = new DeviceModel(deviceModel);
  }

  public async pollMonitor(device: Device) {
    device.deviceModel = await this.loadDeviceModel(device);

    if (device.platform === PlatformType.ThinQ1) {
      let result: Buffer<ArrayBuffer> | null = null;
      // check if work id is registered
      if (!(device.id in this.workIds) || this.workIds[device.id] === null) {
        // register work id
        const workId = await this.registerWorkId(device);
        if (workId === undefined || workId === null) { // device may not connected
          return Helper.transform(device, result);
        }
      }

      try {
        result = await this.api.getMonitorResult(device.id, this.workIds[device.id]);
      } catch (err) {
        if (err instanceof MonitorError) {
          // restart monitor and try again
          await this.unregister(device);
          await this.registerWorkId(device);

          // retry 1 times
          try {
            result = await this.api.getMonitorResult(device.id, this.workIds[device.id]);
          } catch (err) {
            // stop it
            // await this.stopMonitor(device);
          }
        } else if (err instanceof NotConnectedError) {
          // device not online
          // this.log.debug('Device not connected: ', device.toString());
        } else {
          throw err;
        }
      }

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
    const delayMs = (ms: number) => new Promise(res => setTimeout(res, ms));

    let tried = 5;
    while (tried > 0) {
      try {
        await this._registerMQTTListener(callback);
        return;
      } catch (err) {
        tried--;
        this.logger.debug('Cannot start MQTT, retrying in 5s.');
        this.logger.debug('mqtt err:', err);
        await delayMs(5000);
      }
    }

    this.logger.error('Cannot start MQTT!');
  }

  protected async _registerMQTTListener(callback: (data: any) => void) {
    const route = await this.api.getRequest('https://common.lgthinq.com/route').then(data => data.result);

    // key-pair
    const keys = await this.persist.cacheForever('keys', async () => {
      this.logger.debug('Generating 2048-bit key-pair...');
      const keys = forge.pki.rsa.generateKeyPair(2048);

      return {
        privateKey: forge.pki.privateKeyToPem(keys.privateKey),
        publicKey: forge.pki.publicKeyToPem(keys.publicKey),
      };
    });

    // CSR
    const csr = await this.persist.cacheForever('csr', async () => {
      this.logger.debug('Creating certification request (CSR)...');
      const csr = forge.pki.createCertificationRequest();
      csr.publicKey = forge.pki.publicKeyFromPem(keys.publicKey);
      csr.setSubject([
        {
          shortName: 'CN',
          value: 'AWS IoT Certificate',
        },
        {
          shortName: 'O',
          value: 'Amazon',
        },
      ]);
      csr.sign(forge.pki.privateKeyFromPem(keys.privateKey), forge.md.sha256.create());

      return forge.pki.certificationRequestToPem(csr);
    });

    const submitCSR = async () => {
      await this.api.postRequest('service/users/client', {});
      return await this.api.postRequest('service/users/client/certificate', {
        csr: csr.replace(/-----(BEGIN|END) CERTIFICATE REQUEST-----/g, '').replace(/(\r\n|\r|\n)/g, ''),
      }).then(data => data.result);
    };

    const urls = new URL(route.mqttServer);
    // get trusted cer root based on hostname
    let rootCAUrl;
    if (urls.hostname.match(/^([^.]+)-ats.iot.([^.]+).amazonaws.com$/g)) {
      // ats endpoint
      rootCAUrl = 'https://www.amazontrust.com/repository/AmazonRootCA1.pem';
    } else if (urls.hostname.match(/^([^.]+).iot.ruic.lgthinq.com$/g)) {
      // LG owned certificate - Comodo CA
      rootCAUrl = 'http://www.tbs-x509.com/Comodo_AAA_Certificate_Services.crt';
    } else {
      // use legacy VeriSign cert for other endpoint
      // eslint-disable-next-line max-len
      rootCAUrl = 'https://www.websecurity.digicert.com/content/dam/websitesecurity/digitalassets/desktop/pdfs/roots/VeriSign-Class%203-Public-Primary-Certification-Authority-G5.pem';
    }

    const rootCA = await this.api.getRequest(rootCAUrl);

    const connectToMqtt = async () => {
      // submit csr
      const certificate = await submitCSR();

      const connectData = {
        caCert: Buffer.from(rootCA, 'utf-8'),
        privateKey: Buffer.from(keys.privateKey, 'utf-8'),
        clientCert: Buffer.from(certificate.certificatePem, 'utf-8'),
        clientId: this.api.client_id,
        host: urls.hostname,
      };

      this.logger.debug('open mqtt connection to', route.mqttServer);
      const device = new awsIotDevice(connectData);

      device.on('error', (err) => {
        this.logger.error('mqtt err:', err);
      });
      device.on('connect', () => {
        this.logger.info('Successfully connected to the MQTT server.');
        this.logger.debug('mqtt connected:', route.mqttServer);
        for (const subscription of certificate.subscriptions) {
          device.subscribe(subscription);
        }
      });
      device.on('message', (topic, payload) => {
        callback(JSON.parse(payload.toString()));
        this.logger.debug('mqtt message received:', payload.toString());
      });
      device.on('offline', () => {
        device.end();

        this.logger.info('MQTT disconnected, retrying in 60 seconds!');
        setTimeout(async () => {
          await connectToMqtt();
        }, 60000);
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
