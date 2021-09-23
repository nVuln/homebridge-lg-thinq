import {baseDevice} from '../baseDevice';
import {LGThinQHomebridgePlatform} from '../platform';
import {Perms, PlatformAccessory} from 'homebridge';
import {DeviceModel} from '../lib/DeviceModel';
import {Device} from '../lib/Device';

export enum OvenState {
  INITIAL = '@OV_STATE_INITIAL_W',
  PREHEATING = '@OV_STATE_PREHEAT_W',
  COOKING_IN_PROGRESS = '@OV_STATE_COOK_W',
  DONE = '@OV_STATE_COOK_COMPLETE_W',
  COOLING = '@OV_TERM_COOLING_W',
  CLEANING = '@OV_STATE_CLEAN_W',
  CLEANING_DONE = '@OV_STATE_CLEAN_COMPLETE_W',
}

export default class Oven extends baseDevice {
  constructor(
    protected readonly platform: LGThinQHomebridgePlatform,
    protected readonly accessory: PlatformAccessory,
  ) {
    super(platform, accessory);


  }

  protected createCook(key: 'upper' | 'lower' | 'burner') {
    const {
      Service: {
        HeaterCooler,
      },
      Characteristic,
    } = this.platform;

    const device: Device = this.accessory.context.device;

    const service = this.accessory.getService(HeaterCooler) || this.accessory.addService(HeaterCooler, device.name);
    service.getCharacteristic(Characteristic.CurrentHeaterCoolerState)
      .onGet(() => {
        const currentState = device.deviceModel.lookupMonitorValue('UpperOvenState', this.Status.getState(key));
        if (currentState === OvenState.COOLING) {
          return Characteristic.CurrentHeaterCoolerState.COOLING;
        } else if ([OvenState.PREHEATING, OvenState.COOKING_IN_PROGRESS].includes(currentState)) {
          return Characteristic.CurrentHeaterCoolerState.HEATING;
        } else {
          return Characteristic.CurrentHeaterCoolerState.IDLE;
        }
      });
    service.getCharacteristic(Characteristic.TargetHeaterCoolerState)
      .setProps({
        validValues: [Characteristic.TargetHeaterCoolerState.HEAT],
        perms: [Perms.NOTIFY, Perms.PAIRED_READ],
      });
  }

  public get Status() {
    return new OvenStatus(this.accessory.context.device.snapshot?.ovenState, this.accessory.context.device.deviceModel);
  }
}


export class OvenStatus {
  constructor(protected data, protected deviceModel: DeviceModel) {}

  public getState(key: 'upper' | 'lower' | 'burner') {
    return this.data[key + 'State'];
  }
}
