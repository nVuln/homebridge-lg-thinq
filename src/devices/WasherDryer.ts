import {baseDevice} from '../baseDevice';
import {LGThinQHomebridgePlatform} from '../platform';
import {CharacteristicValue, Perms, PlatformAccessory} from 'homebridge';
import {Device} from '../lib/Device';
import {PlatformType} from '../lib/constants';
import {DeviceModel} from '../lib/DeviceModel';

export default class WasherDryer extends baseDevice {
  public isRunning = false;
  public stopTime = 0;
  protected serviceWasherDryer;
  protected serviceEventFinished;
  protected serviceDoorLock;

  constructor(
    protected readonly platform: LGThinQHomebridgePlatform,
    protected readonly accessory: PlatformAccessory,
  ) {
    super(platform, accessory);

    const {
      Service: {
        StatelessProgrammableSwitch,
        LockMechanism,
        Valve,
      },
      Characteristic,
      Characteristic: {
        LockCurrentState,
      },
    } = this.platform;

    const device: Device = accessory.context.device;

    this.serviceWasherDryer = accessory.getService(Valve) || accessory.addService(Valve, device.name);
    this.serviceWasherDryer.getCharacteristic(Characteristic.Active)
      .onSet(this.setActive.bind(this))
      .setProps({
        perms: [
          Perms.PAIRED_READ,
          Perms.NOTIFY,
        ],
      })
      .updateValue(Characteristic.Active.INACTIVE);
    this.serviceWasherDryer.setCharacteristic(Characteristic.Name, device.name);
    this.serviceWasherDryer.setCharacteristic(Characteristic.ValveType, Characteristic.ValveType.WATER_FAUCET);
    this.serviceWasherDryer.setCharacteristic(Characteristic.InUse, Characteristic.InUse.NOT_IN_USE);
    this.serviceWasherDryer.getCharacteristic(Characteristic.RemainingDuration).setProps({
      maxValue: 86400, // 1 day
    });

    // onlu thinq2 support door lock status
    if (device.platform === PlatformType.ThinQ2 && 'doorLock' in device.snapshot?.washerDryer) {
      this.serviceDoorLock = accessory.getService(LockMechanism) || accessory.addService(LockMechanism, device.name + ' - Door');
      this.serviceDoorLock.getCharacteristic(Characteristic.LockCurrentState)
        .onSet(this.setActive.bind(this))
        .setProps({
          minValue: 0,
          maxValue: 3,
          validValues: [LockCurrentState.UNSECURED, LockCurrentState.SECURED, LockCurrentState.UNKNOWN],
        })
        .updateValue(LockCurrentState.UNKNOWN);
      this.serviceDoorLock.getCharacteristic(Characteristic.LockTargetState)
        .onSet(this.setActive.bind(this))
        .updateValue(Characteristic.LockTargetState.UNSECURED);
      this.serviceDoorLock.addLinkedService(this.serviceWasherDryer);
    }

    /*if (this.config?.washer_trigger as boolean) {
      this.serviceEventFinished = accessory.getService(StatelessProgrammableSwitch)
        || accessory.addService(StatelessProgrammableSwitch, device.name + ' - Program Finished');
      this.serviceEventFinished.getCharacteristic(Characteristic.ProgrammableSwitchEvent)
        .setProps({
          minValue: Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS,
          maxValue: Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS,
          validValues: [Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS],
        });
      this.serviceEventFinished.updateCharacteristic(Characteristic.ServiceLabelIndex, 3);
    }*/
    const serviceEvent = accessory.getService(StatelessProgrammableSwitch);
    if (serviceEvent) {
      accessory.removeService(serviceEvent);
    }

    this.updateAccessoryCharacteristic(device);
  }

  public get Status() {
    return new WasherDryerStatus(this.accessory.context.device.snapshot?.washerDryer, this, this.accessory.context.device.deviceModel);
  }

  async setActive(value: CharacteristicValue) {

  }

  public updateAccessoryCharacteristic(device: Device) {
    super.updateAccessoryCharacteristic(device);

    if (!device.online) {
      // device not online, do not update status
      return;
    }

    this.isRunning = this.Status.isRunning;
    const {
      Characteristic,
      Characteristic: {
        LockCurrentState,
      },
    } = this.platform;
    this.serviceWasherDryer.updateCharacteristic(Characteristic.Active, this.Status.isPowerOn ? 1 : 0);
    this.serviceWasherDryer.updateCharacteristic(Characteristic.InUse, this.Status.isRunning ? 1 : 0);
    this.serviceWasherDryer.updateCharacteristic(Characteristic.RemainingDuration, this.Status.remainDuration);

    if (this.serviceDoorLock) {
      this.serviceDoorLock.updateCharacteristic(LockCurrentState, this.Status.isPowerOn ?
        (this.Status.isDoorLocked ? LockCurrentState.SECURED : LockCurrentState.UNSECURED) : LockCurrentState.UNKNOWN);
      this.serviceDoorLock.updateCharacteristic(Characteristic.LockTargetState, this.Status.isDoorLocked ? 1 : 0);
    }

    /*if (this.config?.washer_trigger as boolean && this.serviceEventFinished) {
      if (this.isRunning && !this.Status.isRunning && this.Status.remainDuration <= 0) {
        const SINGLE = Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS;
        this.serviceEventFinished.updateCharacteristic(Characteristic.ProgrammableSwitchEvent, SINGLE);
      }
    }*/
  }
}

export class WasherDryerStatus {
  constructor(protected data, protected accessory, protected deviceModel: DeviceModel) {
  }

  public get isPowerOn() {
    return !['POWEROFF', 'POWERFAIL'].includes(this.data?.state);
  }

  public get isRunning() {
    return this.isPowerOn &&
      ['DETECTING', 'RUNNING', 'RINSING', 'SPINNING', 'DRYING', 'COOLING', 'WASH_REFRESHING', 'STEAMSOFTENING'].includes(this.data?.state);
  }

  public get isRemoteStartEnable() {
    return this.data.remoteStart === this.deviceModel.lookupMonitorName('remoteStart', '@CP_ON_EN_W');
  }

  public get isDoorLocked() {
    return this.data.doorLock === this.deviceModel.lookupMonitorName('doorLock', '@CP_ON_EN_W');
  }

  public get remainDuration() {
    const currentTimestamp = Math.floor(Date.now() / 1000);
    if (!this.isRunning || !this.isPowerOn
      || (this.accessory.stopTime && (currentTimestamp - this.accessory.stopTime) >= currentTimestamp)) {
      this.accessory.stopTime = 0;
      return 0;
    }

    if (!('remainTimeHour' in this.data)) {
      this.data.remainTimeHour = 0;
    }

    const stopTime = this.data.remainTimeHour * 3600 + this.data.remainTimeMinute * 60;

    if (!this.accessory.stopTime || Math.abs(stopTime - this.accessory.stopTime) > 120 /* 2 min different */) {
      this.accessory.stopTime = stopTime;
    }

    return this.accessory.stopTime;
  }
}
