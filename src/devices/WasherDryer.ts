import {baseDevice} from '../baseDevice';
import {LGThinQHomebridgePlatform} from '../platform';
import {PlatformAccessory} from 'homebridge';
import {Device} from '../lib/Device';

export default class WasherDryer extends baseDevice {
  protected serviceWasherDryer;
  protected serviceTemperature;

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

    /*this.serviceDoorLocked = accessory.getService('Door Lock') || accessory.addService(Switch, 'Door Lock', 'Door Lock');
    this.serviceDoorLocked.setCharacteristic(Characteristic.Name, 'Door Lock');
    this.serviceDoorLocked.addLinkedService(this.serviceWasherDryer);

    this.serviceChildLocked = accessory.getService('Child Lock') || accessory.addService(Switch, 'Child Lock', 'Child Lock');
    this.serviceChildLocked.setCharacteristic(Characteristic.Name, 'Child Lock');
    this.serviceChildLocked.addLinkedService(this.serviceWasherDryer);*/

    this.serviceTemperature = accessory.getService(TemperatureSensor)
      || accessory.addService(TemperatureSensor, 'Temperature');
    this.serviceTemperature.addLinkedService(this.serviceWasherDryer);

    this.updateAccessoryCharacteristic(device);
  }

  public updateAccessoryCharacteristic(device: Device) {
    super.updateAccessoryCharacteristic(device);

    const {Characteristic} = this.platform;
    const Status = new WasherDryerStatus(device.snapshot?.washerDryer);
    this.serviceWasherDryer.updateCharacteristic(Characteristic.Active, Status.isPowerOn ? 1 : 0);
    this.serviceWasherDryer.updateCharacteristic(Characteristic.InUse, Status.isRunning ? 1 : 0);
    this.serviceWasherDryer.updateCharacteristic(Characteristic.RemainingDuration, Status.remainDuration);

    /*this.serviceDoorLocked.updateCharacteristic(Characteristic.On, Status.isDoorLocked as boolean);
    this.serviceDoorLocked.setHiddenService(!Status.isPowerOn);

    this.serviceChildLocked.updateCharacteristic(Characteristic.On, Status.isChildLocked as boolean);
    this.serviceChildLocked.setHiddenService(!Status.isPowerOn);*/

    this.serviceTemperature.updateCharacteristic(Characteristic.CurrentTemperature, Status.washingTemperature);
    this.serviceTemperature.setHiddenService(!Status.isPowerOn);
  }
}

export class WasherDryerStatus {
  constructor(protected data) {}

  public get isPowerOn() {
    return this.data?.state !== 'POWEROFF';
  }

  public get isRunning() {
    return this.isPowerOn && ['RUNNING', 'DRYING', 'COOLING'].includes(this.data?.state);
  }

  public get isDoorLocked() {
    return this.data?.doorLock === 'DOOR_LOCK_ON';
  }

  public get isChildLocked() {
    return this.data?.isChildLocked === 'CHILDLOCK_ON';
  }

  public get washingTemperature() {
    let temp = this.data?.temp?.match(/[A-Z_]+_([0-9]+)/);
    temp = temp && temp.length ? temp[1] : 0;
    return temp as number;
  }

  public get remainDuration() {
    const remainTimeInMinute = this.data?.remainTimeHour * 60 + this.data?.remainTimeMinute;
    return remainTimeInMinute * 60;
  }
}
