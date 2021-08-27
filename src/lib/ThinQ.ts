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
      } else if (err.response?.data?.resultCode === '0110') {
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
          this.log.error(err);
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
        deviceModel = await this.api.request.get(device.data.modelJsonUri).then(res => res.data);
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

      this.log.error(err);
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

  public async thinq1DeviceControl(id: string, key: string, value: any) {
    try {
      await this.api.ready();
      return await this.api.sendControlCommand(id, key, value);
    } catch (err) {
      // retry
      if (err instanceof TokenExpiredError) {
        await this.api.refreshNewToken();
        try {
          return await this.api.sendControlCommand(id, key, value);
        } catch (err) {
          this.log.error(err);
        }
      } else {
        this.log.error(err);
      }
    }
  }

  public async deviceControl(id: string, values: Record<string, any>, command: 'Set' | 'Operation' = 'Set', ctrlKey = 'basicCtrl') {
    try {
      await this.api.ready();
      return await this.api.sendCommandToDevice(id, values, command, ctrlKey);
    } catch (err) {
      if (err.response) {
        // submitted same value
        if (err.response.data.resultCode === '0103') {
          return false;
        }

        this.log.error(err.response);
      } else {
        this.log.error(err);
      }
    }
  }

  public async isReady() {
    try {
      await this.persist.init();
      await this.api.ready();
      return true;
    } catch (err) {
      this.log.error(err);
      return false;
    }
  }
}
