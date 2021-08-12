import {default as AirConditioner, FanSpeed} from '../../devices/AirConditioner';
import {CharacteristicValue} from 'homebridge';
import {ACOperation} from '../transforms/AirState';
import {Device} from '../../lib/Device';

export default class AC extends AirConditioner {
  async setActive(value: CharacteristicValue) {
    const device: Device = this.accessory.context.device;
    const isOn = value as boolean;
    const op = isOn ? ACOperation.RIGHT_ON : ACOperation.OFF;
    const opValue = device.deviceModel.enumValue('OpMode', op);

    await this.platform.ThinQ?.thinq1DeviceControl(device.id, 'OpMode', opValue);
  }

  async setTargetTemperature(value: CharacteristicValue) {
    if (!this.Status.isPowerOn) {
      return;
    }

    const device: Device = this.accessory.context.device;
    await this.platform.ThinQ?.thinq1DeviceControl(device.id, 'TempCfg', value as number);
    device.data.snapshot['airState.tempState.target'] = value as number;
    this.updateAccessoryCharacteristic(device);
  }

  async setFanSpeed(value: CharacteristicValue) {
    if (!this.Status.isPowerOn) {
      return;
    }

    const speedValue = Math.max(1, Math.round(value as number));
    const device: Device = this.accessory.context.device;
    const windStrength = Object.keys(FanSpeed)[speedValue - 1] || FanSpeed.HIGH;

    this.platform.ThinQ?.thinq1DeviceControl(device.id, 'WindStrength', windStrength);
  }
}
