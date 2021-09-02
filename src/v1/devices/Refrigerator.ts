import {default as RefrigeratorV2, RefrigeratorStatus, fToC, cToF} from '../../devices/Refrigerator';
import {CharacteristicValue} from 'homebridge';
import {Device} from '../../lib/Device';

export default class Refrigerator extends RefrigeratorV2 {
  protected createThermostat(name: string, key: string) {
    const keyMap = {
      fridgeTemp: 'TempRefrigerator',
      freezerTemp: 'TempFreezer',
    };

    return super.createThermostat(name, keyMap[key]);
  }

  async setTemperature(key: string, temp: string) {
    const device: Device = this.accessory.context.device;
    await this.platform.ThinQ?.thinq1DeviceControl(device.id, key, temp);
  }

  async setExpressFridge(value: CharacteristicValue) {
    const device: Device = this.accessory.context.device;
    const On = device.deviceModel.enumValue('ExpressFridge', '@CP_ON_EN_W');
    const Off = device.deviceModel.enumValue('ExpressFridge', '@CP_OFF_EN_W');

    this.platform.ThinQ?.thinq1DeviceControl(device.id, 'ExpressFridge', value ? On : Off);
  }

  public get Status() {
    return new Status(this.accessory.context.device.snapshot?.refState, this.accessory.context.device.deviceModel);
  }
}

export class Status extends RefrigeratorStatus {
  public get freezerTemperature() {
    if (this.tempUnit === 'FAHRENHEIT') {
      return fToC(parseInt(this.deviceModel.lookupMonitorValue('TempFreezer_F', this.data?.freezerTemp, '0')));
    }

    return parseInt(this.deviceModel.lookupMonitorValue('TempFreezer_C', this.data?.freezerTemp, '0'));
  }

  public get fridgeTemperature() {
    if (this.tempUnit === 'FAHRENHEIT') {
      return fToC(parseInt(this.deviceModel.lookupMonitorValue( 'TempRefrigerator_F', this.data?.fridgeTemp, '0')));
    }

    return parseInt(this.deviceModel.lookupMonitorValue('TempRefrigerator_C', this.data?.fridgeTemp, '0'));
  }

  public get isExpressFridgeOn() {
    return this.data?.expressFridge === this.deviceModel.lookupMonitorName('ExpressFridge', '@CP_ON_EN_W');
  }
}
