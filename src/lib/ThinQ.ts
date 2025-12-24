import { Logger, PlatformConfig } from 'homebridge';
import { API } from './API.js';
import { LGThinQHomebridgePlatform } from '../platform.js';
import { Device, DeviceData } from './Device.js';
import { DeviceType, PlatformType, MQTT_RETRY_DELAY_MS, REQUEST_TIMEOUT_MS } from './constants.js';
import { DeviceModel, ValueType } from './DeviceModel.js';
import { randomUUID } from 'crypto';
import * as Path from 'path';
import * as FS from 'fs';
import forge from 'node-forge';
import Helper from '../v1/helper.js';
import { MonitorError, NotConnectedError } from '../errors/index.js';
import { PLUGIN_NAME } from '../settings.js';
import { device as awsIotDevice } from 'aws-iot-device-sdk';
import { URL } from 'url';
import Persist from './Persist.js';

export type WorkId = string;

export class ThinQ {
  protected api: API;
  protected workIds: Record<string, WorkId | null> = {};
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
    const workId = this.workIds[device.id];
    if (device.platform === PlatformType.ThinQ1 && workId !== null && workId !== undefined) {
      try {
        await this.api.sendMonitorCommand(device.id, 'Stop', workId);
      } catch (err) {
        //this.log.error(err);
      }

      delete this.workIds[device.id];
    }
  }

  protected async registerWorkId(device: any) {
    const data = await this.api.sendMonitorCommand(device.id, 'Start', randomUUID());
    if (data !== undefined && 'workId' in data) {
      this.workIds[device.id] = data.workId;
      return data.workId;
    }

    this.workIds[device.id] = null;
    return null;
  }

  protected async loadDeviceModel(device: Device) {
    let deviceModel = await this.persist.getItem(device.id);
    if (!deviceModel) {
      this.logger.debug('[' + device.id + '] Device model cache missed.');
      const response = await this.api.httpClient.get(device.data.modelJsonUri);
      deviceModel = response.data;
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
        result = await this.api.getMonitorResult(device.id, this.workIds[device.id]!);
      } catch (err) {
        if (err instanceof MonitorError) {
          // restart monitor and try again
          await this.unregister(device);
          await this.registerWorkId(device);

          // retry 1 times
          try {
            result = await this.api.getMonitorResult(device.id, this.workIds[device.id]!);
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
    const model: DeviceModel | undefined = this.deviceModel[id];

    const coerceValue = (k: string, v: any) => {
      if (!model) {
        return v;
      }
      try {
        const vm = model.value(k);
        if (!vm) {
          return v;
        }
        switch (vm.type) {
        case ValueType.Bit: {
          if (typeof v === 'boolean') {
            return v ? 1 : 0;
          }
          if (typeof v === 'string') {
            const n = Number(v);
            return Number.isNaN(n) ? (v === '1' ? 1 : 0) : n;
          }
          return v;
        }
        case ValueType.Range: {
          if (v === null || v === undefined) {
            return v;
          }
          if (typeof v === 'number') {
            return v;
          }
          const nv = Number(v);
          return Number.isNaN(nv) ? v : nv;
        }
        case ValueType.Enum: {
          if (typeof v === 'string') {
            const enumKey = model.enumValue(k, v);
            return enumKey !== null ? enumKey : v;
          }
          return v;
        }
        default: {
          return v;
        }
        }
      } catch (e) {
        return v;
      }
    };

    if (values && typeof values === 'object') {
      if ('dataKey' in values && values.dataKey && 'dataValue' in values) {
        try {
          values.dataValue = coerceValue(values.dataKey, values.dataValue);
        } catch (e) {
          // ignore
        }
      }
      if ('dataSetList' in values && values.dataSetList && typeof values.dataSetList === 'object') {
        for (const k of Object.keys(values.dataSetList)) {
          values.dataSetList[k] = coerceValue(k, values.dataSetList[k]);
        }
      }
    }

    const normalizeBooleans = (obj: any) => {
      if (obj && typeof obj === 'object') {
        for (const k of Object.keys(obj)) {
          const v = obj[k];
          if (typeof v === 'boolean') {
            obj[k] = v ? 1 : 0;
          } else if (v && typeof v === 'object') {
            normalizeBooleans(v);
          }
        }
      }
    };
    normalizeBooleans(values);

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
        await delayMs(MQTT_RETRY_DELAY_MS);
      }
    }

    this.logger.error('Cannot start MQTT!');
  }

  protected async _registerMQTTListener(callback: (data: any) => void) {
    const routeData = await this.api.getRequest('https://common.lgthinq.com/route');
    const route = routeData.result;

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
      const certData = await this.api.postRequest('service/users/client/certificate', {
        csr: csr.replace(/-----(BEGIN|END) CERTIFICATE REQUEST-----/g, '').replace(/(\r\n|\r|\n)/g, ''),
      });
      return certData.result;
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

      const mqttDir = Path.join(this.platform.api.user.storagePath(), PLUGIN_NAME, 'persist', 'mqtt');
      await FS.promises.mkdir(mqttDir, { recursive: true });

      const caPath = Path.join(mqttDir, 'ca.pem');
      const keyPath = Path.join(mqttDir, 'key.pem');
      const certPath = Path.join(mqttDir, 'cert.pem');

      const writeIfChanged = async (p: string, content: string) => {
        try {
          const existing = await FS.promises.readFile(p, 'utf8').catch(() => null);
          if (existing !== content) {
            await FS.promises.writeFile(p, content, 'utf8');
          }
        } catch (err) {
          await FS.promises.writeFile(p, content, 'utf8');
        }
      };

      await writeIfChanged(caPath, rootCA);
      await writeIfChanged(keyPath, keys.privateKey);
      await writeIfChanged(certPath, certificate.certificatePem);

      const connectData = {
        caPath,
        keyPath,
        certPath,
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
        }, REQUEST_TIMEOUT_MS);
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
