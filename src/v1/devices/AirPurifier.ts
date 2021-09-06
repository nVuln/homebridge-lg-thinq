import {default as V2, RotateSpeed} from '../../devices/AirPurifier';
import {CharacteristicValue} from 'homebridge';
import {Device} from '../../lib/Device';

export default class AirPurifier extends V2{
  async setActive(value: CharacteristicValue) {
    const device: Device = this.accessory.context.device;
    await this.platform.ThinQ?.thinq1DeviceControl(device.id, 'Operation', value as boolean ? '1' : '0');
  }

  async setTargetAirPurifierState(value: CharacteristicValue) {
    const device: Device = this.accessory.context.device;
    if (!this.Status.isPowerOn || (!!value !== this.Status.isNormalMode)) {
      return; // just skip it
    }

    await this.platform.ThinQ?.thinq1DeviceControl(device.id, 'OpMode', value as boolean ? '16' : '14');
  }

  async setRotationSpeed(value: CharacteristicValue) {
    if (!this.Status.isPowerOn || !this.Status.isNormalMode) {
      return;
    }

    const device: Device = this.accessory.context.device;
    const values = Object.keys(RotateSpeed);
    const windStrength = parseInt(values[Math.round((value as number)) - 1]) || RotateSpeed.EXTRA;
    await this.platform.ThinQ?.thinq1DeviceControl(device.id, 'WindStrength', windStrength.toString());
  }

  async setSwingMode(value: CharacteristicValue) {
    if (!this.Status.isPowerOn || !this.Status.isNormalMode) {
      return;
    }

    const device: Device = this.accessory.context.device;
    await this.platform.ThinQ?.thinq1DeviceControl(device.id, 'CirculateDir', value as boolean ? '1' : '0');
  }

  async setLight(value: CharacteristicValue) {
    if (!this.Status.isPowerOn) {
      return;
    }

    const device: Device = this.accessory.context.device;
    await this.platform.ThinQ?.thinq1DeviceControl(device.id, 'SignalLighting', value as boolean ? '1' : '0');
  }
}
