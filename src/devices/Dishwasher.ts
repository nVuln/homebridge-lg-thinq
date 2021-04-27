import {baseDevice} from '../baseDevice';
import {LGThinQHomebridgePlatform} from '../platform';
import {PlatformAccessory} from 'homebridge';
import {Device} from '../lib/Device';

export default class Dishwasher extends baseDevice {
  protected serviceDishwasher;

  constructor(
    protected readonly platform: LGThinQHomebridgePlatform,
    protected readonly accessory: PlatformAccessory,
  ) {
    super(platform, accessory);

    const {
      Service: {
        Valve,
      },
      Characteristic,
    } = this.platform;

    const device = accessory.context.device;

    this.serviceDishwasher = accessory.getService(Valve) || accessory.addService(Valve, 'Dishwasher');
    this.serviceDishwasher.setCharacteristic(Characteristic.Name, device.name);
    this.serviceDishwasher.setCharacteristic(Characteristic.ValveType, Characteristic.ValveType.WATER_FAUCET);
    this.serviceDishwasher.getCharacteristic(Characteristic.RemainingDuration).setProps({
      maxValue: 86400, // 1 day
    });

    this.updateAccessoryCharacteristic(device);
  }

  public updateAccessoryCharacteristic(device: Device) {
    super.updateAccessoryCharacteristic(device);

    const {Characteristic} = this.platform;
    const Status = new DishwasherStatus(device.snapshot?.dishwasher);

    this.serviceDishwasher.updateCharacteristic(Characteristic.Active, Status.isPowerOn ? 1 : 0);
    this.serviceDishwasher.updateCharacteristic(Characteristic.InUse, Status.isRunning ? 1 : 0);
    this.serviceDishwasher.updateCharacteristic(Characteristic.RemainingDuration, Status.remainDuration);
  }
}

export class DishwasherStatus {
  constructor(protected data) {}

  public get isPowerOn() {
    return !['POWEROFF', 'POWERFAIL'].includes(this.data?.state);
  }

  public get isRunning() {
    return this.data?.state === 'RUNNING';
  }

  public get remainDuration() {
    const remainTimeInMinute = this.data?.remainTimeHour * 60 + this.data?.remainTimeMinute;
    return remainTimeInMinute * 60;
  }
}
