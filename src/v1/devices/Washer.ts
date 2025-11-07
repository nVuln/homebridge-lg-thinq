import { default as WasherV2 } from '../../devices/WasherDryer.js';
import { LGThinQHomebridgePlatform } from '../../platform.js';
import { CharacteristicValue, Logger, Perms, PlatformAccessory } from 'homebridge';
import { Device } from '../../lib/Device.js';
import { AccessoryContext } from '../../baseDevice.js';

export default class Washer extends WasherV2 {
  constructor(
    public readonly platform: LGThinQHomebridgePlatform,
    public readonly accessory: PlatformAccessory<AccessoryContext>,
    logger: Logger,
  ) {
    super(platform, accessory, logger);

    const {
      Characteristic,
    } = this.platform;

    this.serviceWasherDryer?.getCharacteristic(Characteristic.Active).setProps({
      perms: [
        Perms.PAIRED_READ,
        Perms.NOTIFY,
        Perms.PAIRED_WRITE,
      ],
    });
  }

  async setActive(value: CharacteristicValue) {
    const device: Device = this.accessory.context.device;
    await this.platform.ThinQ?.thinq1DeviceControl(device, 'Power', value as boolean ? 'On' : 'Off');
  }
}
