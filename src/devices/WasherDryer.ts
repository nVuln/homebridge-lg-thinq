import {baseDevice} from '../baseDevice';
import {LGThinQHomebridgePlatform} from '../platform';
import {PlatformAccessory} from 'homebridge';
import {Device} from '../lib/Device';

export default class WasherDryer extends baseDevice {
  protected serviceWasherDryer;
  protected serviceTemperature;
  public stopTime;

  constructor(
    protected readonly platform: LGThinQHomebridgePlatform,
    protected readonly accessory: PlatformAccessory,
  ) {
    super(platform, accessory);

    const {
      Service: {
        TemperatureSensor,
        Valve,
      },
      Characteristic,
    } = this.platform;

    const device: Device = accessory.context.device;

    if (typeof device.snapshot?.washerDryer !== 'object') {
      this.platform.log.debug('washerDryer data not exists: ', JSON.stringify(device));
      return;
    }

    this.serviceWasherDryer = accessory.getService(Valve) || accessory.addService(Valve, device.name);
    this.serviceWasherDryer.setCharacteristic(Characteristic.Name, device.name);
    this.serviceWasherDryer.setCharacteristic(Characteristic.ValveType, Characteristic.ValveType.WATER_FAUCET);
    this.serviceWasherDryer.getCharacteristic(Characteristic.RemainingDuration).setProps({
      maxValue: 86400, // 1 day
    });

    this.serviceTemperature = accessory.getService(TemperatureSensor)
      || accessory.addService(TemperatureSensor, 'Temperature');
    this.serviceTemperature.addLinkedService(this.serviceWasherDryer);

    this.updateAccessoryCharacteristic(device);
  }

  public updateAccessoryCharacteristic(device: Device) {
    super.updateAccessoryCharacteristic(device);

    const {Characteristic} = this.platform;
    this.serviceWasherDryer.updateCharacteristic(Characteristic.Active, this.Status.isPowerOn ? 1 : 0);
    this.serviceWasherDryer.updateCharacteristic(Characteristic.InUse, this.Status.isRunning ? 1 : 0);
    this.serviceWasherDryer.updateCharacteristic(Characteristic.RemainingDuration, this.Status.remainDuration);

    this.serviceTemperature.updateCharacteristic(Characteristic.CurrentTemperature, this.Status.washingTemperature);
    this.serviceTemperature.setHiddenService(!this.Status.isPowerOn);
  }

  public get Status() {
    return new WasherDryerStatus(this.accessory.context.device.snapshot?.washerDryer, this);
  }
}

export class WasherDryerStatus {
  constructor(protected data, protected accessory) {}

  public get isPowerOn() {
    return !['POWEROFF', 'POWERFAIL'].includes(this.data?.state);
  }

  public get isRunning() {
    return this.isPowerOn && ['RUNNING', 'DRYING', 'COOLING'].includes(this.data?.state);
  }

  public get washingTemperature() {
    let temp = this.data?.temp?.match(/[A-Z_]+_([0-9]+)/);
    temp = temp && temp.length ? temp[1] : 0;
    return temp as number;
  }

  public get remainDuration() {
    const currentTimestamp = Math.floor(Date.now() / 1000);
    if (!this.isRunning || !this.isPowerOn || (this.accessory.stopTime && this.accessory.stopTime < currentTimestamp)) {
      this.accessory.stopTime = 0;
      return 0;
    }

    if (!this.accessory.stopTime) {
      const remainTimeInMinute = this.data?.remainTimeHour * 60 + this.data?.remainTimeMinute;
      this.accessory.stopTime = currentTimestamp + remainTimeInMinute * 60;
    }

    return this.accessory.stopTime - currentTimestamp;
  }
}
