import {default as RangeHoodV2} from '../../devices/RangeHood';
import {CharacteristicValue} from "homebridge";
import {Device} from '../../lib/Device';

export default class RangeHood extends RangeHoodV2 {
  async setHoodRotationSpeed(value: CharacteristicValue) {
    const device: Device = this.accessory.context.device;
    await this.platform.ThinQ?.thinq1DeviceControl(device, 'VentLevel', value);
  }

  async setLightBrightness(value: CharacteristicValue) {
    const device: Device = this.accessory.context.device;
    await this.platform.ThinQ?.thinq1DeviceControl(device, 'LampLevel', value);
  }
}
