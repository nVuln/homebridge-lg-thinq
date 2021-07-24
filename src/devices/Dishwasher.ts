import {baseDevice} from '../baseDevice';
import {LGThinQHomebridgePlatform} from '../platform';
import {PlatformAccessory} from 'homebridge';
import {Device} from '../lib/Device';
import {WasherDryerStatus} from './WasherDryer';

export default class Dishwasher extends baseDevice {
  protected serviceDishwasher;
  public stopTime;

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
    this.serviceDishwasher.getCharacteristic(Characteristic.Active)
      .onSet(this.setActive.bind(this))
      .updateValue(Characteristic.Active.INACTIVE);
    this.serviceDishwasher.setCharacteristic(Characteristic.InUse, Characteristic.InUse.NOT_IN_USE);
    this.serviceDishwasher.getCharacteristic(Characteristic.RemainingDuration).setProps({
      maxValue: 86400, // 1 day
    });

    this.updateAccessoryCharacteristic(device);
  }

  public setActive() {
    throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.NOT_ALLOWED_IN_CURRENT_STATE);
  }

  public updateAccessoryCharacteristic(device: Device) {
    super.updateAccessoryCharacteristic(device);

    if (!device.snapshot.online) {
      // device not online, do not update status
      return;
    }

    const {Characteristic} = this.platform;

    this.serviceDishwasher.updateCharacteristic(Characteristic.RemainingDuration, this.Status.remainDuration);
    this.serviceDishwasher.updateCharacteristic(Characteristic.Active, this.Status.isPowerOn ? 1 : 0);
    this.serviceDishwasher.updateCharacteristic(Characteristic.InUse, this.Status.isRunning ? 1 : 0);
  }

  public get Status() {
    return new DishwasherStatus(this.accessory.context.device.snapshot?.dishwasher, this, this.accessory.context.device.deviceModel);
  }
}

// re-use some status in washer
export class DishwasherStatus extends WasherDryerStatus {
  public get isRunning() {
    return this.isPowerOn && this.data?.state === 'RUNNING';
  }
}
