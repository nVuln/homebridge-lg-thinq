import {Logger, PlatformConfig} from 'homebridge';
import {API} from './API';
import {LGThinQHomebridgePlatform} from '../platform';
import {Device} from './Device';
import {PlatformType} from './constants';
import * as uuid from 'uuid';
import {DeviceModel} from './DeviceModel';
import Helper from '../v1/helper';
import {MonitorError} from '../errors/MonitorError';
import {NotConnectedError} from '../errors/NotConnectedError';
export type WorkId = typeof uuid['v4'];

export class ThinQ {
  protected api: API;
  protected workIds: Record<string, WorkId> = {};
  protected deviceModel: Record<string, DeviceModel> = {};
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
  }

  public async devices() {
    await this.api.ready();
    let listDevices;
    try {
      listDevices = await this.api.getListDevices();
    } catch (err) {
      // network issue, no response
      if (!err.response) {
        return [];
      }

      // retry it 1 times
      try {
        await this.api.refreshNewToken();
        listDevices = await this.api.getListDevices();
      } catch (err) {
        // write log if error not is network issue
        if (!err.response) {
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

  public async startMonitor(device: Device) {
    try {
      if (!(device.id in this.deviceModel)) {
        this.deviceModel[device.id] = await this.api.getDeviceModelInfo(device.data).then(modelInfo => {
          return new DeviceModel(modelInfo);
        });
      }

      device.deviceModel = this.deviceModel[device.id];

      if (device.platform === PlatformType.ThinQ1) {
        this.workIds[device.id] = await this.api.sendMonitorCommand(device.id, 'Start', uuid.v4()).then(data => data.workId);
      }
    } catch (err) {
      if (err instanceof NotConnectedError) {
        return false;
      }

      this.log.error(err);
    }
  }

  public async stopMonitor(device: Device) {
    if (device.platform === PlatformType.ThinQ1 && device.id in this.workIds) {
      try {
        await this.api.sendMonitorCommand(device.id, 'Stop', this.workIds[device.id]);
        delete this.workIds[device.id];
      } catch (err) {
        this.log.error(err);
      }
    }
  }

  public async pollMonitor(device: Device) {
    if (device.platform === PlatformType.ThinQ1) {
      let result: any = new Uint8Array(1024);
      try {
        if (!(device.id in this.workIds)) {
          throw new NotConnectedError();
        }

        result = await this.api.getMonitorResult(device.id, this.workIds[device.id]);
      } catch (err) {
        if (err instanceof MonitorError) {
          // restart monitor and try again
          await this.stopMonitor(device);
          await this.startMonitor(device);

          // retry 1 times
          try {
            result = await this.api.getMonitorResult(device.id, this.workIds[device.id]);
          } catch (err) {
            // stop it
            await this.stopMonitor(device);
          }
        } else if (err instanceof NotConnectedError) {
          this.log.debug('Device not connected: ', device.toString());
        } else {
          throw err;
        }
      }

      return Helper.transform(device, this.deviceModel[device.id], result);
    }

    return device;
  }

  public async deviceControl(id: string, values: Record<string, any>) {
    try {
      return await this.api.sendCommandToDevice(id, values);
    } catch (err) {
      this.log.error(err);
      throw err;
    }
  }

  public async isReady() {
    try {
      await this.api.ready();
      return true;
    } catch (err) {
      this.log.error(err);
      return false;
    }
  }
}
