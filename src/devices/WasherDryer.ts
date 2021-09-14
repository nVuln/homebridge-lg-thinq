import {baseDevice} from '../baseDevice';
import {LGThinQHomebridgePlatform} from '../platform';
import {CharacteristicValue, Perms, PlatformAccessory} from 'homebridge';
import {Device} from '../lib/Device';
import {PlatformType} from '../lib/constants';
import {DeviceModel} from '../lib/DeviceModel';

export const RUNNING_STATUS = ['DETECTING', 'RUNNING', 'RINSING', 'SPINNING', 'DRYING', 'COOLING', 'WASH_REFRESHING', 'STEAMSOFTENING'];

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
        OccupancySensor,
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

    // only thinq2 support door lock status
    this.serviceDoorLock = accessory.getService(LockMechanism);
    if (this.config.washer_door_lock && device.platform === PlatformType.ThinQ2 && 'doorLock' in device.snapshot?.washerDryer) {
      this.serviceDoorLock = this.serviceDoorLock || accessory.addService(LockMechanism, device.name + ' - Door');
      this.serviceDoorLock.getCharacteristic(Characteristic.LockCurrentState)
        .onSet(this.setActive.bind(this))
        .setProps({
          minValue: 0,
          maxValue: 3,
          validValues: [LockCurrentState.UNSECURED, LockCurrentState.SECURED],
        })
        .updateValue(LockCurrentState.UNSECURED);
      this.serviceDoorLock.getCharacteristic(Characteristic.LockTargetState)
        .onSet(this.setActive.bind(this))
        .updateValue(Characteristic.LockTargetState.UNSECURED);
      this.serviceDoorLock.addLinkedService(this.serviceWasherDryer);
    } else if (this.serviceDoorLock) {
      accessory.removeService(this.serviceDoorLock);
    }

    this.serviceEventFinished = accessory.getService(OccupancySensor);
    if (this.config.washer_trigger as boolean) {
      this.serviceEventFinished = this.serviceEventFinished || accessory.addService(OccupancySensor, device.name + ' - Program Finished');
      // eslint-disable-next-line max-len
      this.serviceEventFinished.updateCharacteristic(Characteristic.OccupancyDetected, Characteristic.OccupancyDetected.OCCUPANCY_NOT_DETECTED);
    } else if (this.serviceEventFinished) {
      accessory.removeService(this.serviceEventFinished);
    }

    this.updateAccessoryCharacteristic(device);
  }

  public get Status() {
    return new WasherDryerStatus(this.accessory.context.device.snapshot?.washerDryer, this, this.accessory.context.device.deviceModel);
  }

  async setActive(value: CharacteristicValue) {
    return;
  }

  public updateAccessoryCharacteristic(device: Device) {
    super.updateAccessoryCharacteristic(device);

    const {
      Characteristic,
      Characteristic: {
        LockCurrentState,
      },
    } = this.platform;
    this.serviceWasherDryer.updateCharacteristic(Characteristic.Active, this.Status.isPowerOn ? 1 : 0);
    this.serviceWasherDryer.updateCharacteristic(Characteristic.InUse, this.Status.isRunning ? 1 : 0);
    this.serviceWasherDryer.updateCharacteristic(Characteristic.RemainingDuration, this.Status.remainDuration);

    if (this.config.washer_door_lock && this.serviceDoorLock) {
      // eslint-disable-next-line max-len
      this.serviceDoorLock.updateCharacteristic(LockCurrentState, this.Status.isDoorLocked ? LockCurrentState.SECURED : LockCurrentState.UNSECURED);
      this.serviceDoorLock.updateCharacteristic(Characteristic.LockTargetState, this.Status.isDoorLocked ? 1 : 0);
    }
  }

  public get config() {
    return Object.assign({}, {
      washer_trigger: false,
      washer_door_lock: false,
    }, super.config);
  }

  public update(snapshot) {
    // when washer state is changed
    if (this.config.washer_trigger as boolean && this.serviceEventFinished && 'preState' in snapshot && 'state' in snapshot) {
      const {
        Characteristic: {
          OccupancyDetected,
        },
      } = this.platform;

      // detect if washer program in done
      if (snapshot.state === 'END' && RUNNING_STATUS.includes(snapshot.preState)) {
        this.serviceEventFinished.updateCharacteristic(OccupancyDetected, OccupancyDetected.OCCUPANCY_DETECTED);
        this.isRunning = false; // marked device as not running
      }

      // detect if washer program is start
      if (RUNNING_STATUS.includes(snapshot.state) && !this.isRunning) {
        this.serviceEventFinished.updateCharacteristic(OccupancyDetected, OccupancyDetected.OCCUPANCY_DETECTED);
        this.isRunning = true;
      }
    }

    super.update(snapshot);
  }
}

export class WasherDryerStatus {
  constructor(protected data, protected accessory, protected deviceModel: DeviceModel) {
  }

  public get isPowerOn() {
    return !['POWEROFF', 'POWERFAIL'].includes(this.data?.state);
  }

  public get isRunning() {
    return this.isPowerOn && RUNNING_STATUS.includes(this.data?.state);
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

    const {
      remainTimeHour = 0,
      remainTimeMinute = 0,
    } = this.data;

    const stopTime = remainTimeHour * 3600 + remainTimeMinute * 60;

    if (!this.accessory.stopTime || Math.abs(stopTime - this.accessory.stopTime) > 120 /* 2 min different */) {
      this.accessory.stopTime = stopTime;
    }

    return this.accessory.stopTime;
  }
}
