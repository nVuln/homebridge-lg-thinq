import { default as AirConditioner, FanSpeed } from '../../devices/AirConditioner.js';
import { CharacteristicValue } from 'homebridge';
import { ACOperation } from '../transforms/AirState.js';
import { Device } from '../../lib/Device.js';
import { RangeValue } from '../../lib/DeviceModel.js';

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

  async setFanState(value: CharacteristicValue) {
    const { TargetFanState } = this.platform.Characteristic;
    if (!this.Status.isPowerOn) {
      this.logger.debug('Power is off, cannot set fan state');
      return;
    }
    const device: Device = this.accessory.context.device;

    const windStrength = value === TargetFanState.AUTO ? 8 : FanSpeed.HIGH; // 8 mean fan auto mode
    await this.platform.ThinQ?.thinq1DeviceControl(device, 'WindStrength', windStrength);
    return;
  }

  async setJetModeActive(value: CharacteristicValue) {
    const device: Device = this.accessory.context.device;
    if (typeof value !== 'number') {
      return;
    }
    if (this.Status.isPowerOn && this.Status.opMode === 0) {
      const jetModeValue = value;
      await this.platform.ThinQ?.thinq1DeviceControl(device, 'Jet', jetModeValue);
    }
  }

  async setActive(value: CharacteristicValue) {
    const device: Device = this.accessory.context.device;
    if (typeof value !== 'number') {
      return;
    }
    const isOn = value === 1;
    const op = isOn ? ACOperation.RIGHT_ON : ACOperation.OFF;
    const opValue = device.deviceModel.enumValue('Operation', op);

    await this.platform.ThinQ?.thinq1DeviceControl(device, 'Operation', opValue);
    return;
  }

  async setTargetTemperature(value: CharacteristicValue) {
    if (!this.Status.isPowerOn) {
      return;
    }
    if (typeof value !== 'number') {
      return;
    }

    const device: Device = this.accessory.context.device;
    await this.platform.ThinQ?.thinq1DeviceControl(device, 'TempCfg', `${value}`);
    device.data.snapshot['airState.tempState.target'] = value as number;
    this.updateAccessoryCharacteristic(device);
    return;
  }

  async setFanSpeed(value: CharacteristicValue) {
    if (!this.Status.isPowerOn) {
      return;
    }

    if (typeof value !== 'number') {
      return;
    }

    const speedValue = Math.max(1, Math.round(value as number));
    const device: Device = this.accessory.context.device;
    const windStrength = parseInt(Object.keys(FanSpeed)[speedValue - 1]) || FanSpeed.HIGH;

    await this.platform.ThinQ?.thinq1DeviceControl(device, 'WindStrength', windStrength);
  }

  async setSwingMode(value: CharacteristicValue) {
    if (!this.Status.isPowerOn) {
      return;
    }

    const swingValue = !!value as boolean ? '100' : '0';

    const device: Device = this.accessory.context.device;

    if (this.config.ac_swing_mode === 'BOTH' || this.config.ac_swing_mode === 'VERTICAL') {
      await this.platform.ThinQ?.thinq1DeviceControl(device, 'WDirVStep', swingValue);
      device.data.snapshot['airState.wDir.vStep'] = swingValue;
    }

    if (this.config.ac_swing_mode === 'BOTH' || this.config.ac_swing_mode === 'HORIZONTAL') {
      await this.platform.ThinQ?.thinq1DeviceControl(device, 'WDirHStep', swingValue);
      device.data.snapshot['airState.wDir.hStep'] = swingValue;
    }

    this.updateAccessoryCharacteristic(device);
  }

  async setOpMode(deviceId: string, opMode: number) {
    const device: Device = this.accessory.context.device;
    const result = await this.platform.ThinQ?.thinq1DeviceControl(device, 'OpMode', opMode);
    device.data.snapshot['airState.opMode'] = opMode;

    this.updateAccessoryCharacteristic(device);
    return result !== null;
  }

  async setLight(value: CharacteristicValue) {
    const device: Device = this.accessory.context.device;
    await this.platform.ThinQ?.thinq1DeviceControl(device, 'DisplayControl', value ? '1' : '0');
  }
}
