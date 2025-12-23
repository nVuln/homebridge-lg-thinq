import { default as V2, RotateSpeed } from '../../devices/AirPurifier.js';
import { CharacteristicValue, Logger, PlatformAccessory } from 'homebridge';
import { Device } from '../../lib/Device.js';
import { LGThinQHomebridgePlatform } from '../../platform.js';
import { AccessoryContext } from '../../baseDevice.js';
import { safeParseInt } from '../helper.js';

export default class AirPurifier extends V2 {
  constructor(
    public readonly platform: LGThinQHomebridgePlatform,
    public readonly accessory: PlatformAccessory<AccessoryContext>,
    logger: Logger,
  ) {
    super(platform, accessory, logger);
  }

  async setActive(value: CharacteristicValue) {
    const device: Device = this.accessory.context.device;
    await this.platform.ThinQ?.thinq1DeviceControl(device, 'Operation', value as boolean ? '1' : '0');
  }

  async setTargetAirPurifierState(value: CharacteristicValue) {
    const device: Device = this.accessory.context.device;
    if (!this.Status.isPowerOn || (!!value !== this.Status.isNormalMode)) {
      return; // just skip it
    }

    await this.platform.ThinQ?.thinq1DeviceControl(device, 'OpMode', value as boolean ? '16' : '14');
  }

  async setRotationSpeed(value: CharacteristicValue) {
    if (!this.Status.isPowerOn || !this.Status.isNormalMode) {
      return;
    }

    const device: Device = this.accessory.context.device;
    const values = Object.keys(RotateSpeed);
    const windStrength = safeParseInt(values[Math.round((value as number)) - 1], RotateSpeed.EXTRA);
    await this.platform.ThinQ?.thinq1DeviceControl(device, 'WindStrength', windStrength.toString());
  }

  async setSwingMode(value: CharacteristicValue) {
    if (!this.Status.isPowerOn || !this.Status.isNormalMode) {
      return;
    }

    const device: Device = this.accessory.context.device;
    await this.platform.ThinQ?.thinq1DeviceControl(device, 'CirculateDir', value as boolean ? '1' : '0');
  }

  async setLight(value: CharacteristicValue) {
    if (!this.Status.isPowerOn) {
      return;
    }

    const device: Device = this.accessory.context.device;
    await this.platform.ThinQ?.thinq1DeviceControl(device, 'SignalLighting', value as boolean ? '1' : '0');
  }

  async setAirFastActive(value: CharacteristicValue) {
    if (!this.Status.isPowerOn) {
      return;
    }

    const device: Device = this.accessory.context.device;
    await this.platform.ThinQ?.thinq1DeviceControl(device, 'AirFast', value as boolean ? '1' : '0');
  }
}
