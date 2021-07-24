import {baseDevice} from '../baseDevice';
import {LGThinQHomebridgePlatform} from '../platform';
import {PlatformAccessory} from 'homebridge';
import {Device} from '../lib/Device';
import {PlatformType} from '../lib/constants';
import {DeviceModel} from '../lib/DeviceModel';

export default class WasherDryer extends baseDevice {
  protected serviceWasherDryer;
  protected serviceEventFinished;
  protected serviceDoorLock;

  public isRunning = false;
  public stopTime = 0;

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
    } = this.platform;

    const device: Device = accessory.context.device;

    this.serviceWasherDryer = accessory.getService(Valve) || accessory.addService(Valve, device.name);
    this.serviceWasherDryer.getCharacteristic(Characteristic.Active)
      .onSet(this.setActive.bind(this))
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
          minValue: Characteristic.LockCurrentState.UNSECURED,
          maxValue: Characteristic.LockCurrentState.SECURED,
        })
        .updateValue(Characteristic.LockCurrentState.UNSECURED);
      this.serviceDoorLock.getCharacteristic(Characteristic.LockTargetState)
        .onSet(this.setActive.bind(this))
        .updateValue(Characteristic.LockTargetState.UNSECURED);
      this.serviceDoorLock.addLinkedService(this.serviceWasherDryer);
    }

    if (this.platform.config.washer_trigger as boolean) {
      this.serviceEventFinished = accessory.getService(StatelessProgrammableSwitch)
        || accessory.addService(StatelessProgrammableSwitch, device.name + ' - Program Finished');
      this.serviceEventFinished.getCharacteristic(Characteristic.ProgrammableSwitchEvent)
        .setProps({
          minValue: Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS,
          maxValue: Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS,
          validValues: [Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS],
        });
      this.serviceEventFinished.updateCharacteristic(Characteristic.ServiceLabelIndex, 3);
    } else {
      const serviceEvent = accessory.getService(StatelessProgrammableSwitch);
      if (serviceEvent) {
        accessory.removeService(serviceEvent);
      }
    }

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

    this.isRunning = this.Status.isRunning;
    const {Characteristic} = this.platform;
    this.serviceWasherDryer.updateCharacteristic(Characteristic.Active, this.Status.isPowerOn ? 1 : 0);
    this.serviceWasherDryer.updateCharacteristic(Characteristic.InUse, this.Status.isRunning ? 1 : 0);
    this.serviceWasherDryer.updateCharacteristic(Characteristic.RemainingDuration, this.Status.remainDuration);

    if (this.serviceDoorLock) {
      this.serviceDoorLock.updateCharacteristic(Characteristic.LockCurrentState, this.Status.isDoorLocked ? 1 : 0);
      this.serviceDoorLock.updateCharacteristic(Characteristic.LockTargetState, this.Status.isDoorLocked ? 1 : 0);
    }

    if (this.platform.config.washer_trigger as boolean) {
      if (this.isRunning && !this.Status.isRunning && this.Status.remainDuration <= 0) {
        const SINGLE = Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS;
        this.serviceEventFinished.updateCharacteristic(Characteristic.ProgrammableSwitchEvent, SINGLE);
      }
    }
  }

  public get Status() {
    return new WasherDryerStatus(this.accessory.context.device.snapshot?.washerDryer, this, this.accessory.context.device.deviceModel);
  }
}

export class WasherDryerStatus {
  constructor(protected data, protected accessory, protected deviceModel: DeviceModel) {}

  public get isPowerOn() {
    return !['POWEROFF', 'POWERFAIL'].includes(this.data?.state);
  }

  public get isRunning() {
    return this.isPowerOn &&
      ['DETECTING', 'RUNNING', 'RINSING', 'SPINNING', 'DRYING', 'COOLING', 'WASH_REFRESHING', 'STEAMSOFTENING'].includes(this.data?.state);
  }

  public get isRemoteStartEnable() {
    return this.data.remoteStart === this.deviceModel.lookupMonitorEnumName('remoteStart', '@CP_ON_EN_W');
  }

  public get isDoorLocked() {
    return this.data.doorLock === this.deviceModel.lookupMonitorEnumName('doorLock', '@CP_ON_EN_W');
  }

  public get remainDuration() {
    const currentTimestamp = Math.floor(Date.now() / 1000);
    if (!this.isRunning || !this.isPowerOn || (this.accessory.stopTime && this.accessory.stopTime < currentTimestamp)) {
      this.accessory.stopTime = 0;
      return 0;
    }

    if (!('remainTimeHour' in this.data)) {
      this.data.remainTimeHour = 0;
    }

    const stopTime = currentTimestamp + this.data.remainTimeHour * 60 + this.data.remainTimeMinute * 60;

    if (!this.accessory.stopTime || Math.abs(stopTime - this.accessory.stopTime) > 120 /* 2 min different */) {
      this.accessory.stopTime = stopTime;
    }

    return this.accessory.stopTime - currentTimestamp;
  }
}
