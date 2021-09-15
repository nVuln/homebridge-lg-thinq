import {Logger, PlatformConfig} from 'homebridge';
import {API} from './API';
import {LGThinQHomebridgePlatform} from '../platform';
import {Device} from './Device';
import {PlatformType, API_CLIENT_ID} from './constants';
import * as uuid from 'uuid';
import * as Path from 'path';
import * as forge from 'node-forge';
import {DeviceModel} from './DeviceModel';
import Helper from '../v1/helper';
import {NotConnectedError, ManualProcessNeeded, MonitorError, TokenExpiredError, AuthenticationError} from '../errors';
import axios from 'axios';
import {PLUGIN_NAME} from '../settings';
import {device as awsIotDevice} from 'aws-iot-device-sdk';
import {URL} from 'url';
import Persist from './Persist';

export type WorkId = typeof uuid['v4'];

export class ThinQ {
  protected api: API;
  protected workIds: Record<string, WorkId> = {};
  protected deviceModel: Record<string, DeviceModel> = {};
  protected persist;
  constructor(
    public readonly platform: LGThinQHomebridgePlatform,
    public readonly config: PlatformConfig,
    public readonly log: Logger,
  ) {
    this.api = new API(this.config.country, this.config.language);

    if (config.refresh_token) {
      this.api.setRefreshToken(config.refresh_token);
    } else if (config.username && config.password) {
      this.api.setUsernamePassword(config.username, config.password);
    }

    this.persist = new Persist(Path.join(this.platform.api.user.storagePath(), PLUGIN_NAME, 'persist', 'devices'));
  }

  public async device(id) {
    const devices = await this.devices();

    return devices.find(device => device.id === id);
  }

  public async devices() {
    await this.api.ready();
    let listDevices;
    try {
      listDevices = await this.api.getListDevices();
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.data?.resultCode === '0110') {
        this.log.error('Please open the native LG App and sign in to your account to see what happened, '+
          'maybe new agreement need your accept. Then try restarting Homebridge.');

        throw new ManualProcessNeeded();
      } else {
        if (!(err instanceof NotConnectedError)) {
          this.log.error('Unknown Error: ', err);
        }

        return [];
      }
    }

    return listDevices.map(dev => {
      const device = new Device(dev);
      device.deviceModel = this.deviceModel[device.id];
      return device;
    });
  }

  public async loadDeviceModel(device: Device) {
    let deviceModel = await this.persist.getItem(device.id);
    if (!deviceModel) {
      this.log.debug('[' + device.id + '] Device model cache missed.');
      try {
        deviceModel = await this.api.getRequest(device.data.modelJsonUri);
        await this.persist.setItem(device.id, deviceModel);
      } catch (err) {
        this.log.error('['+ device.id +'] Unable to get device model - ', err);
        return false;
      }
    }

    this.deviceModel[device.id] = device.deviceModel = new DeviceModel(deviceModel);
  }

  public async startMonitor(device: Device, retry = false) {
    try {
      await this.api.ready();
      await this.loadDeviceModel(device);

      if (device.platform === PlatformType.ThinQ1) {
        this.workIds[device.id] = await this.api.sendMonitorCommand(device.id, 'Start', uuid.v4()).then(data => data.workId);
      }
    } catch (err) {
      if (err instanceof NotConnectedError) {
        return false;
      }

      // retry 1 times
      if (!retry && err instanceof TokenExpiredError) {
        await this.api.refreshNewToken();
        await this.startMonitor(device, true);
      }

      this.log.error('Unknown Error: ', err);
    }
  }

  public async stopMonitor(device: Device) {
    if (device.platform === PlatformType.ThinQ1 && device.id in this.workIds) {
      try {
        await this.api.ready();
        await this.api.sendMonitorCommand(device.id, 'Stop', this.workIds[device.id]);
      } catch (err) {
        //this.log.error(err);
      }

      delete this.workIds[device.id];
    }
  }

  public async pollMonitor(device: Device) {
    if (!device.deviceModel) {
      device.deviceModel = this.deviceModel[device.id];
    }

    if (device.platform === PlatformType.ThinQ1) {
      let result: any = null;
      try {
        if (!(device.id in this.workIds)) {
          throw new NotConnectedError();
        }

        await this.api.ready();
        result = await this.api.getMonitorResult(device.id, this.workIds[device.id]);
      } catch (err) {
        if (err instanceof TokenExpiredError) {
          await this.api.refreshNewToken();
        } else if (err instanceof MonitorError) {
          // restart monitor and try again
          await this.stopMonitor(device);
          await this.startMonitor(device);

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

  public async thinq1DeviceControl(device: string | Device, key: string, value: any) {
    const id = device instanceof Device ? device.id : device;
    const data: any = {
      cmd: 'Control',
      cmdOpt: 'Set',
      deviceId: id,
      workId: uuid.v4(),
    };
    if (device instanceof Device && device.deviceModel.data.ControlWifi?.type === 'BINARY(BYTE)') {
      data.value = 'ControlData';
      const sampleData = device.deviceModel.data.ControlWifi?.action?.SetControl?.data || '[]';
      const decodedMonitor = device.snapshot.raw || {};
      decodedMonitor[key] = value;
      // build data array of byte
      const byteArray = new Uint8Array(JSON.parse(Object.keys(decodedMonitor).reduce((prev, key) => {
        return prev.replace(new RegExp('{{'+key+'}}', 'g'), parseInt(decodedMonitor[key] || '0'));
      }, sampleData)));
      data.data = btoa(String.fromCharCode(...byteArray));
      data.format = 'B64';
    } else {
      data.value = {
        [key]: value,
      };
      data.data = '';
    }

    try {
      await this.api.ready();
      return await this.api.thinq1PostRequest('rti/rtiControl', data);
    } catch (err) {
      // retry
      if (err instanceof TokenExpiredError) {
        await this.api.refreshNewToken();
        try {
          return await this.api.thinq1PostRequest('rti/rtiControl', data);
        } catch (err) {
          this.log.error('Unknown Error: ', err);
        }
      } else {
        this.log.error('Unknown Error: ', err);
      }
    }
  }

  public async deviceControl(id: string, values: Record<string, any>, command: 'Set' | 'Operation' = 'Set', ctrlKey = 'basicCtrl') {
    try {
      await this.api.ready();
      return await this.api.sendCommandToDevice(id, values, command, ctrlKey);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response) {
        // submitted same value
        if (err.response.data.resultCode === '0103') {
          return false;
        }

        this.log.error('Unknown Error: ', err.response);
      } else {
        this.log.error('Unknown Error: ', err);
      }
    }
  }

  public async registerMQTTListener(callback: (data: any) => void) {
    const delayMs = ms => new Promise(res => setTimeout(res, ms))

    let tried = 5;
    while(tried > 0) {
      try {
        await this._registerMQTTListener(callback);
        return;
      } catch (err) {
        tried--;
        this.log.debug('Cannot start MQTT, retrying in 5s.');
        await delayMs(5000);
      }
    }

    this.log.error('Cannot start MQTT!');
  }

  protected async _registerMQTTListener(callback: (data: any) => void) {
    const ttl = 86400000; // 1 day
    const route = await this.api.getRequest('https://common.lgthinq.com/route').then(data => data.result);

    // key-pair
    const keys = await this.persist.cacheForever('keys', async () => {
      this.log.debug('Generating 2048-bit key-pair...');
      const keys = forge.pki.rsa.generateKeyPair(2048);

      return {
        privateKey: forge.pki.privateKeyToPem(keys.privateKey),
        publicKey: forge.pki.publicKeyToPem(keys.publicKey),
      };
    });

    // CSR
    const csr = await this.persist.cacheForever('csr', async () => {
      this.log.debug('Creating certification request (CSR)...');
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

    // get trusted cer root
    const rootCA = await this.persist.cache('rootCA', ttl, async () => {
      const rootCA = await this.api.getRequest('https://good.sca1a.amazontrust.com/');
      return rootCA.match(/-----BEGIN CERTIFICATE-----([\s\S]*?)-----END CERTIFICATE-----/)[0];
    });

    const urls = new URL(route.mqttServer);

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

      const device = awsIotDevice(connectData);

      device.on('error', (err) => {
        this.log.error('mqtt err:', err);
      });
      device.on('connect', () => {
        this.log.debug('mqtt connecting:', route.mqttServer);
        for (const subscription of certificate.subscriptions) {
          device.subscribe(subscription);
        }
      });
      device.on('message', (topic, payload) => {
        callback(JSON.parse(payload.toString()));
        this.log.debug('mqtt message received:', payload.toString());
      });
      device.on('offline', () => {
        device.end();

        this.log.info('MQTT disconnected, retrying in 60 seconds!');
        setTimeout(async () => {
          await connectToMqtt();
        }, 60000);
      });
    };

    // first call
    await connectToMqtt();
  }

  public async isReady() {
    try {
      await this.persist.init();
      await this.api.ready();
      return true;
    } catch (err) {
      if (err instanceof AuthenticationError) {
        this.log.error(err.message);
      } else {
        this.log.error('Unknown Error: ', err);
      }
      return false;
    }
  }
}
