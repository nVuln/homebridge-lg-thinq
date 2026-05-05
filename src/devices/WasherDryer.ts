import { AccessoryContext, BaseDevice } from '../baseDevice.js';
import { LGThinQHomebridgePlatform } from '../platform.js';
import { CharacteristicValue, Logger, PlatformAccessory, Service } from 'homebridge';
import { Device } from '../lib/Device.js';
import { PlatformType } from '../lib/constants.js';
import { type DeviceModel } from '../lib/DeviceModel.js';
import {
  hasSnapshotKey,
  snapshotNumber,
  snapshotString,
  updateCharacteristicIfChanged,
} from './helpers.js';

export const NOT_RUNNING_STATUS = ['COOLDOWN', 'POWEROFF', 'POWERFAIL', 'INITIAL', 'PAUSE', 'AUDIBLE_DIAGNOSIS', 'FIRMWARE',
  'COURSE_DOWNLOAD', 'ERROR', 'END'];

export type WasherDryerModelLookup = Pick<DeviceModel, 'lookupMonitorName'>;

export type WasherDryerState = {
  isPowerOn: boolean;
  isRunning: boolean;
  isError: boolean;
  isRemoteStartEnable: boolean;
  isDoorLocked: boolean;
  remainDuration: number;
  TCLCount: number;
};

export function readWasherDryerState(data: any, deviceModel: WasherDryerModelLookup): WasherDryerState {
  const state = snapshotString(data, 'state', 'POWEROFF');
  const isPowerOn = !['POWEROFF', 'POWERFAIL'].includes(state);
  const isRunning = isPowerOn && !NOT_RUNNING_STATUS.includes(state);
  const doorLockState = deviceModel.lookupMonitorName('doorLock', '@CP_ON_EN_W');
  const remainTimeHour = snapshotNumber(data, 'remainTimeHour');
  const remainTimeMinute = snapshotNumber(data, 'remainTimeMinute');

  return {
    isPowerOn,
    isRunning,
    isError: state === 'ERROR',
    isRemoteStartEnable: snapshotString(data, 'remoteStart') === deviceModel.lookupMonitorName('remoteStart', '@CP_ON_EN_W'),
    isDoorLocked: doorLockState === null
      ? snapshotString(data, 'doorLock') === 'DOORLOCK_ON'
      : snapshotString(data, 'doorLock') === doorLockState,
    remainDuration: isRunning ? remainTimeHour * 3600 + remainTimeMinute * 60 : 0,
    TCLCount: Math.min(snapshotNumber(data, 'TCLCount'), 30),
  };
}

export default class WasherDryer extends BaseDevice {
  public isRunning = false;
  public isServiceTubCleanMaintenanceTriggered = false;

  protected serviceWasherDryer: Service | undefined;
  protected serviceEventFinished: Service | undefined;
  protected serviceDoorLock: Service | undefined;
  protected serviceTubCleanMaintenance: Service | undefined;

  constructor(
    public readonly platform: LGThinQHomebridgePlatform,
    public readonly accessory: PlatformAccessory<AccessoryContext>,
    logger: Logger,
  ) {
    super(platform, accessory, logger);

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

    this.serviceWasherDryer = accessory.getService(Valve);
    if (!this.serviceWasherDryer) {
      this.serviceWasherDryer = accessory.addService(Valve, device.name, device.name);
      this.serviceWasherDryer.addOptionalCharacteristic(Characteristic.ConfiguredName);
      this.serviceWasherDryer.updateCharacteristic(Characteristic.ConfiguredName, device.name);
    }

    this.serviceWasherDryer.getCharacteristic(Characteristic.Active)
      .onGet(this.onlineGet(() => this.Status.isPowerOn ? Characteristic.Active.ACTIVE : Characteristic.Active.INACTIVE))
      .onSet(this.setActive.bind(this))
      .updateValue(Characteristic.Active.INACTIVE);
    this.serviceWasherDryer.setCharacteristic(Characteristic.Name, device.name);
    this.serviceWasherDryer.setCharacteristic(Characteristic.ValveType, Characteristic.ValveType.WATER_FAUCET);
    this.serviceWasherDryer.getCharacteristic(Characteristic.InUse)
      .onGet(this.onlineGet(() => this.Status.isRunning ? Characteristic.InUse.IN_USE : Characteristic.InUse.NOT_IN_USE))
      .updateValue(Characteristic.InUse.NOT_IN_USE);
    this.serviceWasherDryer.getCharacteristic(Characteristic.RemainingDuration)
      .onGet(this.onlineGet(() => this.Status.remainDuration))
      .setProps({
        maxValue: 86400, // 1 day
      });
    this.serviceWasherDryer.getCharacteristic(Characteristic.StatusFault)
      .onGet(this.onlineGet(() => {
        return this.Status.isError ? Characteristic.StatusFault.GENERAL_FAULT : Characteristic.StatusFault.NO_FAULT;
      }));

    // only thinq2 support door lock status
    this.serviceDoorLock = accessory.getService(LockMechanism);
    // Avoid using `in` against an optionally chained value; ensure objects exist first.
    if (this.config.washer_door_lock && device.platform === PlatformType.ThinQ2
      && hasSnapshotKey(device.snapshot?.washerDryer, 'doorLock')) {
      if (!this.serviceDoorLock) {
        this.serviceDoorLock = accessory.addService(LockMechanism, device.name + ' - Door');
        this.serviceDoorLock.addOptionalCharacteristic(Characteristic.ConfiguredName);
        this.serviceDoorLock.updateCharacteristic(Characteristic.ConfiguredName, device.name + ' - Door');
      }

      this.serviceDoorLock.getCharacteristic(Characteristic.LockCurrentState)
        .updateValue(LockCurrentState.UNSECURED)
        .onGet(this.onlineGet(() => this.Status.isDoorLocked ? LockCurrentState.SECURED : LockCurrentState.UNSECURED))
        .onSet(this.setActive.bind(this))
        .setProps({
          minValue: 0,
          maxValue: 3,
          validValues: [LockCurrentState.UNSECURED, LockCurrentState.SECURED],
        });
      this.serviceDoorLock.getCharacteristic(Characteristic.LockTargetState)
        .onGet(this.onlineGet(() => this.Status.isDoorLocked ? Characteristic.LockTargetState.SECURED : Characteristic.LockTargetState.UNSECURED))
        .onSet(this.setActive.bind(this))
        .updateValue(Characteristic.LockTargetState.UNSECURED);
    } else if (this.serviceDoorLock) {
      accessory.removeService(this.serviceDoorLock);
    }

    this.serviceEventFinished = accessory.getService('Program Finished');
    if (this.config.washer_trigger as boolean) {
      if (!this.serviceEventFinished) {
        this.serviceEventFinished = accessory.addService(OccupancySensor, 'Program Finished', 'Program Finished');
        this.serviceEventFinished.addOptionalCharacteristic(Characteristic.ConfiguredName);
        this.serviceEventFinished.updateCharacteristic(Characteristic.ConfiguredName, 'Program Finished');
      }

      this.serviceEventFinished.setCharacteristic(Characteristic.Name, 'Program Finished');
       
      this.serviceEventFinished.updateCharacteristic(Characteristic.OccupancyDetected, Characteristic.OccupancyDetected.OCCUPANCY_NOT_DETECTED);
    } else if (this.serviceEventFinished) {
      accessory.removeService(this.serviceEventFinished);
    }

    // tub clean coach
    this.serviceTubCleanMaintenance = accessory.getService('Tub Clean Coach');
    if (this.config.washer_tub_clean as boolean) {
      if (!this.serviceTubCleanMaintenance) {
        this.serviceTubCleanMaintenance = accessory.addService(OccupancySensor, 'Tub Clean Coach', 'Tub Clean Coach');
        this.serviceTubCleanMaintenance.addOptionalCharacteristic(Characteristic.ConfiguredName);
        this.serviceTubCleanMaintenance.updateCharacteristic(Characteristic.ConfiguredName, 'Tub Clean Coach');
      }

      this.serviceTubCleanMaintenance.setCharacteristic(Characteristic.Name, 'Tub Clean Coach');
       
      this.serviceTubCleanMaintenance.updateCharacteristic(Characteristic.OccupancyDetected, Characteristic.OccupancyDetected.OCCUPANCY_NOT_DETECTED);

      this.serviceTubCleanMaintenance.setCharacteristic(Characteristic.Name, 'Tub Clean Coach');
      this.serviceTubCleanMaintenance.getCharacteristic(Characteristic.ProgrammableSwitchEvent)
        .setProps({
          validValues: [0], // single press
        });
    } else if (this.serviceTubCleanMaintenance) {
      accessory.removeService(this.serviceTubCleanMaintenance);
    }
  }

  public get Status() {
    return readWasherDryerState(this.accessory.context.device.snapshot?.washerDryer, this.accessory.context.device.deviceModel);
  }

  public get config() {
    return Object.assign({}, {
      washer_trigger: false,
      washer_door_lock: false,
      washer_tub_clean: false,
    }, super.config);
  }

  async setActive(value: CharacteristicValue) {
    this.requireDeviceOnline();
    void value;
    // do nothing, revert back
    this.updateAccessoryCharacteristic(this.accessory.context.device);
  }

  public updateAccessoryCharacteristic(device: Device) {
    super.updateAccessoryCharacteristic(device);

    const {
      Characteristic,
    } = this.platform;
    updateCharacteristicIfChanged(this.serviceWasherDryer, Characteristic.Active, this.Status.isPowerOn ? 1 : 0);
    updateCharacteristicIfChanged(this.serviceWasherDryer, Characteristic.InUse, this.Status.isRunning ? 1 : 0);
    updateCharacteristicIfChanged(this.serviceWasherDryer, Characteristic.RemainingDuration, this.Status.remainDuration);

    updateCharacteristicIfChanged(this.serviceWasherDryer, Characteristic.StatusFault,
      this.Status.isError ? Characteristic.StatusFault.GENERAL_FAULT : Characteristic.StatusFault.NO_FAULT);

    if (this.config.washer_door_lock && this.serviceDoorLock) {
      updateCharacteristicIfChanged(this.serviceDoorLock, Characteristic.LockCurrentState,
        this.Status.isDoorLocked ? Characteristic.LockCurrentState.SECURED : Characteristic.LockCurrentState.UNSECURED);
      updateCharacteristicIfChanged(this.serviceDoorLock, Characteristic.LockTargetState, this.Status.isDoorLocked ? 1 : 0);
    }
  }

  public update(snapshot: any) {
    super.update(snapshot);

    const washerDryer = snapshot.washerDryer;
    if (!washerDryer) {
      return;
    }

    const {
      Characteristic: {
        OccupancyDetected,
      },
    } = this.platform;

    // when washer state is changed
    if (this.config.washer_trigger as boolean && this.serviceEventFinished
      && ('preState' in washerDryer || 'processState' in washerDryer) && 'state' in washerDryer) {

      // detect if washer program in done
      if ((['END', 'COOLDOWN'].includes(washerDryer.state)
          && !NOT_RUNNING_STATUS.includes(washerDryer.preState || washerDryer.processState))
          || (this.isRunning && !this.Status.isRunning)) {
        this.serviceEventFinished.updateCharacteristic(OccupancyDetected, OccupancyDetected.OCCUPANCY_DETECTED);
        this.isRunning = false; // marked device as not running

        // turn it off after 10 minute
        setTimeout(() => {
          this.serviceEventFinished?.updateCharacteristic(OccupancyDetected, OccupancyDetected.OCCUPANCY_NOT_DETECTED);
        }, 10000 * 60);
      }

      // detect if washer program is start
      if (this.Status.isRunning && !this.isRunning) {
        this.serviceEventFinished?.updateCharacteristic(OccupancyDetected, OccupancyDetected.OCCUPANCY_NOT_DETECTED);
        this.isRunning = true;
      }
    }

    if ('TCLCount' in washerDryer && this.serviceTubCleanMaintenance) {
      // detect if tub clean coach counter is reached
      if (this.Status.TCLCount >= 30) {
        this.serviceTubCleanMaintenance.updateCharacteristic(OccupancyDetected, OccupancyDetected.OCCUPANCY_DETECTED);
      } else {
        // reset tub clean coach trigger flag
        this.serviceTubCleanMaintenance.updateCharacteristic(OccupancyDetected, OccupancyDetected.OCCUPANCY_NOT_DETECTED);
      }
    }
  }
}

export class WasherDryerStatus {
  private readonly state: WasherDryerState;

  constructor(public data: any, protected deviceModel: DeviceModel) {
    this.state = readWasherDryerState(data, deviceModel);
  }

  public get isPowerOn() {
    return this.state.isPowerOn;
  }

  public get isRunning() {
    return this.state.isRunning;
  }

  public get isError() {
    return this.state.isError;
  }

  public get isRemoteStartEnable() {
    return this.state.isRemoteStartEnable;
  }

  public get isDoorLocked() {
    return this.state.isDoorLocked;
  }

  public get remainDuration() {
    return this.state.remainDuration;
  }

  public get TCLCount() {
    return this.state.TCLCount;
  }
}
