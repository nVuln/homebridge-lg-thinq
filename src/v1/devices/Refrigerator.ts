import {default as RefrigeratorV2, RefrigeratorStatus, fToC, cToF} from '../../devices/Refrigerator';
import {CharacteristicValue} from 'homebridge';
import {Device} from '../../lib/Device';

export default class Refrigerator extends RefrigeratorV2 {
  protected createThermostat(name: string, key: string) {
    const keyMap = {
      fridgeTemp: 'TempRefrigerator',
      freezerTemp: 'TempFreezer',
    };

    const {Characteristic} = this.platform;
    const serviceThermostat = super.createThermostat(name, keyMap[key] || key);
    serviceThermostat.getCharacteristic(Characteristic.TargetTemperature)
      .onSet((value: CharacteristicValue) => {
        const device: Device = this.accessory.context.device;
        let indexValue;
        if (this.Status.tempUnit === 'FAHRENHEIT') {
          indexValue = device.deviceModel.enumValue(key + '_F', cToF(value as number).toString());
        } else {
          indexValue = device.deviceModel.enumValue(key + '_C', value.toString());
        }

        if (!indexValue) {
          throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.INVALID_VALUE_IN_REQUEST);
        }

        this.platform.ThinQ?.thinq1DeviceControl(device.id, keyMap[key], indexValue);
      });

    return serviceThermostat;
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

  public get tempUnit() {
    return this.data?.tempUnit ? 'CELSIUS' : 'FAHRENHEIT';
  }
}
