import {Logger, PlatformConfig} from 'homebridge';
import {API} from './API';
import {LGThinQHomebridgePlatform} from '../platform';
import {Device} from './Device';

export class ThinQ {
  protected api: API;
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
