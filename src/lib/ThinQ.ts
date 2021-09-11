import {Logger, PlatformConfig} from 'homebridge';
import {API} from './API';
import {LGThinQHomebridgePlatform} from '../platform';
import {Device} from './Device';
import {PlatformType} from './constants';
import * as uuid from 'uuid';
import * as NodePersist from 'node-persist';
import * as Path from 'path';
import {DeviceModel} from './DeviceModel';
import Helper from '../v1/helper';
import {NotConnectedError, ManualProcessNeeded, MonitorError, TokenExpiredError} from '../errors';
import axios from 'axios';
import {PLUGIN_NAME} from '../settings';
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

    this.persist = NodePersist.create({
      dir: Path.join(this.platform.api.user.storagePath(), PLUGIN_NAME, 'persist', 'devices'),
    });
  }

  public async devices() {
    await this.api.ready();
    let listDevices;
    try {
      listDevices = await this.api.getListDevices();
    } catch (err) {
      if (err instanceof NotConnectedError) {
        return [];
      } else if (axios.isAxiosError(err) && err.response?.data?.resultCode === '0110') {
        this.log.error('Please open the native LG App and sign in to your account to see what happened, '+
          'maybe new agreement need your accept. Then try restarting Homebridge.');

        throw new ManualProcessNeeded();
      }

      // retry it 1 times, resultCode 0102 = token expired
      try {
        await this.api.refreshNewToken();
        listDevices = await this.api.getListDevices();
      } catch (err) {
        // write log if error not is network issue
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
        deviceModel = await this.api.getRequest(device.data.modelJsonUri).then(res => res.data);
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

  public async isReady() {
    try {
      await this.persist.init();
      await this.api.ready();
      return true;
    } catch (err) {
      if (err instanceof Error) {
        this.log.error(err.message);
      } else {
        this.log.error('Unknown Error: ', err);
      }
      return false;
    }
  }
}
