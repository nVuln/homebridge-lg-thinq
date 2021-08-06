import {baseDevice} from '../baseDevice';
import {LGThinQHomebridgePlatform} from '../platform';
import {CharacteristicValue, Perms, PlatformAccessory} from 'homebridge';
import {Device} from '../lib/Device';
import {PlatformType} from '../lib/constants';
import {DeviceModel} from '../lib/DeviceModel';

export default class WasherDryer extends baseDevice {
  protected serviceWasherDryer;
  protected serviceEventFinished;
  protected serviceDoorLock;

  protected interval: NodeJS.Timer | null = null;
  protected intervalTime = 10000; // 10s
  protected lastMessage;
  protected ready = false;

  public stopTime;

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
    const activePerms = [
      Perms.PAIRED_READ,
      Perms.NOTIFY,
    ];
    if (device.platform === PlatformType.ThinQ1) {
      activePerms.push(Perms.PAIRED_WRITE);
    }

    this.serviceWasherDryer.getCharacteristic(Characteristic.Active)
      .onSet(this.setActive.bind(this))
      .setProps({ perms: activePerms })
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

    if (this.config?.washer_trigger as boolean) {
      this.serviceEventFinished = accessory.getService(StatelessProgrammableSwitch)
        || accessory.addService(StatelessProgrammableSwitch, device.name + ' - Program Finished');
      this.serviceEventFinished.getCharacteristic(Characteristic.ProgrammableSwitchEvent)
        .setProps({
          minValue: Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS,
          maxValue: Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS,
          validValues: [Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS],
        });
    } else {
      const serviceEvent = accessory.getService(StatelessProgrammableSwitch);
      if (serviceEvent) {
        accessory.removeService(serviceEvent);
      }
    }

    this.updateAccessoryCharacteristic(device);

    this.platform.ThinQ?.getLatestNotificationOfDevice(device).then(message => {
      this.lastMessage = message;
      this.ready = true;
    });
  }

  public setActive(value: CharacteristicValue) {
    const device: Device = this.accessory.context.device;
    if (device.platform === PlatformType.ThinQ1) {
      this.platform.ThinQ?.thinq1DeviceControl(device.id, 'Power', value as boolean ? 'On' : 'Off');
      return value;
    }

    throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.NOT_ALLOWED_IN_CURRENT_STATE);
  }

  public updateAccessoryCharacteristic(device: Device) {
    super.updateAccessoryCharacteristic(device);

    if (!device.snapshot.online) {
      // device not online, do not update status
      return;
    }

    const {
      Characteristic,
      Characteristic: {
        LockCurrentState,
      },
    } = this.platform;

    if (this.config?.washer_trigger as boolean && this.Status.isRunning && !this.interval && this.ready) {
      this.interval = setInterval(async () => {
        const lastMessage = await this.platform.ThinQ?.getLatestNotificationOfDevice(device);
        if (lastMessage && lastMessage.message?.extra?.code === '0000' && lastMessage.seqNo !== this.lastMessage?.seqNo) {
          // single pressed button
          const SINGLE = Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS;
          this.serviceEventFinished.updateCharacteristic(Characteristic.ProgrammableSwitchEvent, SINGLE);

          if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
          }
        }
      }, this.intervalTime);
    }

    this.serviceWasherDryer.updateCharacteristic(Characteristic.Active, this.Status.isPowerOn ? 1 : 0);
    this.serviceWasherDryer.updateCharacteristic(Characteristic.InUse, this.Status.isRunning ? 1 : 0);

    if (this.Status.remainDuration !== null) {
      this.serviceWasherDryer.updateCharacteristic(Characteristic.RemainingDuration, this.Status.remainDuration);
    }

    if (this.serviceDoorLock) {
      this.serviceDoorLock.updateCharacteristic(LockCurrentState, this.Status.isPowerOn ?
        (this.Status.isDoorLocked ? LockCurrentState.SECURED : LockCurrentState.UNSECURED) : LockCurrentState.UNKNOWN);
      this.serviceDoorLock.updateCharacteristic(Characteristic.LockTargetState, this.Status.isDoorLocked ? 1 : 0);
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
    if (!this.isRunning) {
      return null; // skip it if washer not running
    }

    const currentTimestamp = Math.floor(Date.now() / 1000);

    const {
      remainTimeHour = 0,
      remainTimeMinute = 0,
    } = this.data;

    const remainDuration = remainTimeHour * 3600 + remainTimeMinute * 60;

    if (!this.accessory.stopTime || Math.abs(currentTimestamp + remainDuration - this.accessory.stopTime) > 120 /* 2 min different */) {
      this.accessory.stopTime = currentTimestamp + remainDuration;
      return remainDuration;
    }

    return null;
  }
}
