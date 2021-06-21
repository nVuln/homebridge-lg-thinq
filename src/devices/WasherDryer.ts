import {baseDevice} from '../baseDevice';
import {LGThinQHomebridgePlatform} from '../platform';
import {PlatformAccessory} from 'homebridge';
import {Device} from '../lib/Device';
import {PlatformType} from '../lib/constants';

export default class WasherDryer extends baseDevice {
  protected serviceWasherDryer;
  protected serviceEventFinished;
  protected serviceLabel;
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
        ServiceLabel,
        LockMechanism,
        Valve,
      },
      Characteristic,
    } = this.platform;

    const device: Device = accessory.context.device;

    this.serviceLabel = accessory.getService(ServiceLabel) || accessory.addService(ServiceLabel, device.name);

    this.serviceWasherDryer = accessory.getService(Valve) || accessory.addService(Valve, device.name);
    this.serviceWasherDryer.getCharacteristic(Characteristic.Active).
      onSet(this.setActive.bind(this));
    this.serviceWasherDryer.setCharacteristic(Characteristic.Name, device.name);
    this.serviceWasherDryer.setCharacteristic(Characteristic.ValveType, Characteristic.ValveType.WATER_FAUCET);
    this.serviceWasherDryer.getCharacteristic(Characteristic.RemainingDuration).setProps({
      maxValue: 86400, // 1 day
    });
    this.serviceWasherDryer.updateCharacteristic(Characteristic.ServiceLabelIndex, 1);
    this.serviceWasherDryer.addLinkedService(this.serviceLabel);

    // onlu thinq2 support door lock status
    if (device.platform === PlatformType.ThinQ2) {
      this.serviceDoorLock = accessory.getService(LockMechanism) || accessory.addService(LockMechanism, 'Door Lock');
      this.serviceDoorLock.getCharacteristic(Characteristic.LockCurrentState)
        .onSet(this.setActive.bind(this))
        .setProps({
          minValue: Characteristic.LockCurrentState.UNSECURED,
          maxValue: Characteristic.LockCurrentState.SECURED,
        });
      this.serviceDoorLock.getCharacteristic(Characteristic.LockTargetState)
        .onSet(this.setActive.bind(this));
      this.serviceDoorLock.updateCharacteristic(Characteristic.ServiceLabelIndex, 2);
      this.serviceDoorLock.addLinkedService(this.serviceLabel);
    }

    if (this.platform.config.washer_trigger as boolean) {
      this.serviceEventFinished = accessory.getService(StatelessProgrammableSwitch)
        || accessory.addService(StatelessProgrammableSwitch, 'Washer Finished');
      this.serviceEventFinished.getCharacteristic(Characteristic.ProgrammableSwitchEvent)
        .setProps({
          minValue: Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS,
          maxValue: Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS,
          validValues: [Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS],
        });
      this.serviceEventFinished.updateCharacteristic(Characteristic.ServiceLabelIndex, 3);
      this.serviceEventFinished.addLinkedService(this.serviceLabel);
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

    if (this.platform.config.washer_trigger as boolean) {
      if (!this.isRunning && this.Status.isRunning && this.stopTime) {
        this.once('washer.finished', () => {
          const SINGLE = Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS;
          this.serviceEventFinished.updateCharacteristic(Characteristic.ProgrammableSwitchEvent, SINGLE);
        });
      }

      if (this.isRunning && !this.Status.isRunning && this.stopTime) {
        this.emit('washer.finished');
      }
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
    return this.isPowerOn &&
      ['DETECTING', 'RUNNING', 'RINSING', 'SPINNING', 'DRYING', 'COOLING', 'WASH_REFRESHING', 'STEAMSOFTENING'].includes(this.data?.state);
  }

  public get isDoorLocked() {
    return this.data.doorLock === 'DOOR_LOCK_ON';
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
