import {default as AirConditioner, FanSpeed} from '../../devices/AirConditioner';
import {CharacteristicValue} from 'homebridge';
import {ACOperation} from '../transforms/AirState';
import {Device} from '../../lib/Device';
import {RangeValue} from '../../lib/DeviceModel';

export default class AC extends AirConditioner {

  protected createHeaterCoolerService() {
    const {
      Characteristic,
    } = this.platform;
    const device: Device = this.accessory.context.device;

    super.createHeaterCoolerService();

    const currentTemperatureValue = device.deviceModel.value('TempCur') as RangeValue;
    this.service.getCharacteristic(Characteristic.CurrentTemperature)
      .setProps({
        minValue: currentTemperatureValue.min,
        maxValue: currentTemperatureValue.max,
      });

    const targetTemperatureValue = device.deviceModel.value('TempCfg') as RangeValue;
    this.service.getCharacteristic(Characteristic.CoolingThresholdTemperature)
      .setProps({
        minValue: targetTemperatureValue.min,
        maxValue: targetTemperatureValue.max,
      });
    this.service.getCharacteristic(Characteristic.HeatingThresholdTemperature)
      .setProps({
        minValue: targetTemperatureValue.min,
        maxValue: targetTemperatureValue.max,
      });
  }

  async setActive(value: CharacteristicValue) {
    const device: Device = this.accessory.context.device;
    const isOn = value as boolean;
    const op = isOn ? ACOperation.RIGHT_ON : ACOperation.OFF;
    const opValue = device.deviceModel.enumValue('Operation', op);

    await this.platform.ThinQ?.thinq1DeviceControl(device.id, 'Operation', opValue);
  }

  async setTargetTemperature(value: CharacteristicValue) {
    if (!this.Status.isPowerOn) {
      return;
    }

    const device: Device = this.accessory.context.device;
    await this.platform.ThinQ?.thinq1DeviceControl(device.id, 'TempCfg', value as string);
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

  async setSwingMode(value: CharacteristicValue) {
    if (!this.Status.isPowerOn) {
      return;
    }

    const swingValue = !!value as boolean ? '100' : '0';

    const device: Device = this.accessory.context.device;

    if (this.config.ac_swing_mode === 'BOTH' || this.config.ac_swing_mode === 'VERTICAL') {
      await this.platform.ThinQ?.thinq1DeviceControl(device.id, 'WDirVStep', swingValue);
      device.data.snapshot['airState.wDir.vStep'] = swingValue;
    }

    if (this.config.ac_swing_mode === 'BOTH' || this.config.ac_swing_mode === 'HORIZONTAL') {
      await this.platform.ThinQ?.thinq1DeviceControl(device.id, 'WDirHStep', swingValue);
      device.data.snapshot['airState.wDir.hStep'] = swingValue;
    }

    this.updateAccessoryCharacteristic(device);
  }

  async setOpMode(opMode) {
    const device: Device = this.accessory.context.device;
    await this.platform.ThinQ?.thinq1DeviceControl(device.id, 'OpMode', opMode);
    device.data.snapshot['airState.opMode'] = opMode;

    this.updateAccessoryCharacteristic(device);
  }
}
