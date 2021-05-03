import {Logger, PlatformConfig} from 'homebridge';
import {API} from './API';
import {LGThinQHomebridgePlatform} from '../platform';
import {Device} from './Device';
import {PlatformType} from './constants';
import * as uuid from 'uuid';
import {DeviceModel} from './DeviceModel';
import Helper from '../v1/helper';
import {MonitorError} from '../errors/MonitorError';
export type WorkId = typeof uuid['v4'];

export class ThinQ {
  protected api: API;
  protected workIds!: Record<string, WorkId>;
  protected deviceModel!: Record<string, DeviceModel>;
  constructor(
    public readonly platform: LGThinQHomebridgePlatform,
    public readonly config: PlatformConfig,
    public readonly log: Logger,
  ) {
    this.api = new API(this.config.country, this.config.language, this.config.username, this.config.password);
  }

  public async devices() {
    await this.api.ready();
    const listDevices = await this.api.getListDevices().catch(async () => {
      await this.api.refreshNewToken();
      return await this.api.getListDevices().catch(err => {
        this.log.error(err);
        return [];
      });
    });

    return listDevices.map(device => new Device(device));
  }

  public async device(id: string) {
    await this.api.ready();
    const device = await this.api.getDeviceInfo(id).catch(async () => {
      await this.api.refreshNewToken();
      return await this.api.getDeviceInfo(id).catch(err => {
        this.log.error(err);
      });
    });

    return new Device(device);
  }

  public async startMonitor(device: Device) {
    if (device.platform === PlatformType.ThinQ1) {
      if (typeof this.deviceModel[device.id] === 'undefined') {
        this.api.getDeviceModelInfo(device.data).then(modelInfo => {
          this.deviceModel[device.id] = new DeviceModel(modelInfo);
        });
      }

      await this.api.sendMonitorCommand(device.id, 'Start', uuid.v4()).then(workId => {
        this.workIds[device.id] = workId;
      });
    }
  }

  public async stopMonitor(device: Device) {
    if (device.platform === PlatformType.ThinQ1 && typeof this.workIds[device.id] !== 'undefined') {
      await this.api.sendMonitorCommand(device.id, 'Stop', this.workIds[device.id]);
      delete this.workIds[device.id];
    }
  }

  public async pollMonitor(device: Device) {
    if (device.platform === PlatformType.ThinQ1 && typeof this.workIds[device.id] !== 'undefined') {
      const result = await this.api.getMonitorResult(device.id, this.workIds[device.id])
        .catch(async err => {
          if (err instanceof MonitorError) {
            await this.stopMonitor(device);
            await this.startMonitor(device);
            return await this.api.getMonitorResult(device.id, this.workIds[device.id]);
          }

          throw err;
        });

      return Helper.transform(device, this.deviceModel[device.id], result);
    }

    return device;
  }

  public async deviceControl(id: string, values: Record<string, any>) {
    return await this.api.sendCommandToDevice(id, values);
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
