import { AccessoryContext, BaseDevice } from '../baseDevice.js';
import { LGThinQHomebridgePlatform } from '../platform.js';
import { CharacteristicValue, Logger, PlatformAccessory } from 'homebridge';
import { Device } from '../lib/Device.js';
import { type DeviceModel } from '../lib/DeviceModel.js';
import { snapshotNumber, snapshotString, updateCharacteristicIfChanged } from './helpers.js';

export const NOT_RUNNING_STATUS = ['POWEROFF', 'INITIAL', 'PAUSE', 'COMPLETE', 'ERROR', 'DIAGNOSIS', 'RESERVED',
  'SLEEP', 'FOTA'];

export type StylerModelLookup = Pick<DeviceModel, 'lookupMonitorName'>;

export type StylerState = {
  isPowerOn: boolean;
  isRemoteStartOn: boolean;
  isRunning: boolean;
  isError: boolean;
  remainDuration: number;
};

export function readStylerState(data: any, deviceModel: StylerModelLookup): StylerState {
  const state = snapshotString(data, 'state', 'POWEROFF');
  const isPowerOn = !['POWEROFF', 'POWERFAIL'].includes(state);
  const isRunning = isPowerOn && !NOT_RUNNING_STATUS.includes(state);
  const remainTimeHour = snapshotNumber(data, 'remainTimeHour');
  const remainTimeMinute = snapshotNumber(data, 'remainTimeMinute');

  return {
    isPowerOn,
    isRemoteStartOn: snapshotString(data, 'remoteStart') === deviceModel.lookupMonitorName('remoteStart', '@CP_ON_EN_W'),
    isRunning,
    isError: state === 'ERROR',
    remainDuration: isRunning ? remainTimeHour * 3600 + remainTimeMinute * 60 : 0,
  };
}

export default class Styler extends BaseDevice {
  protected serviceStyter;

  constructor(
    public readonly platform: LGThinQHomebridgePlatform,
    public readonly accessory: PlatformAccessory<AccessoryContext>,
    logger: Logger,
  ) {
    super(platform, accessory, logger);

    const device: Device = this.accessory.context.device;

    const {
      Service: {
        Valve,
      },
      Characteristic,
    } = this.platform;

    this.serviceStyter = accessory.getService(Valve) || accessory.addService(Valve, device.name);
    this.serviceStyter.getCharacteristic(Characteristic.Active)
      .onGet(this.onlineGet(() => this.Status.isPowerOn ? Characteristic.Active.ACTIVE : Characteristic.Active.INACTIVE))
      .onSet(this.setActive.bind(this))
      .updateValue(Characteristic.Active.INACTIVE);
    this.serviceStyter.setCharacteristic(Characteristic.Name, device.name);
    this.serviceStyter.setCharacteristic(Characteristic.ValveType, Characteristic.ValveType.GENERIC_VALVE);
    this.serviceStyter.getCharacteristic(Characteristic.InUse)
      .onGet(this.onlineGet(() => this.Status.isRunning ? Characteristic.InUse.IN_USE : Characteristic.InUse.NOT_IN_USE))
      .updateValue(Characteristic.InUse.NOT_IN_USE);
    this.serviceStyter.getCharacteristic(Characteristic.RemainingDuration)
      .onGet(this.onlineGet(() => this.Status.remainDuration))
      .setProps({
        maxValue: 86400, // 1 day
      });
    this.serviceStyter.getCharacteristic(Characteristic.StatusFault)
      .onGet(this.onlineGet(() => {
        return this.Status.isError ? Characteristic.StatusFault.GENERAL_FAULT : Characteristic.StatusFault.NO_FAULT;
      }));
  }

  public updateAccessoryCharacteristic(device: Device) {
    super.updateAccessoryCharacteristic(device);

    const {
      Characteristic,
    } = this.platform;
    updateCharacteristicIfChanged(this.serviceStyter, Characteristic.Active, this.Status.isPowerOn ? 1 : 0);
    updateCharacteristicIfChanged(this.serviceStyter, Characteristic.InUse, this.Status.isRunning ? 1 : 0);
    updateCharacteristicIfChanged(this.serviceStyter, Characteristic.RemainingDuration, this.Status.remainDuration);

    updateCharacteristicIfChanged(this.serviceStyter, Characteristic.StatusFault,
      this.Status.isError ? Characteristic.StatusFault.GENERAL_FAULT : Characteristic.StatusFault.NO_FAULT);
  }

  async setActive(value: CharacteristicValue) {
    this.requireDeviceOnline();
    void value;
    if (this.Status.isRemoteStartOn) {
      // turn on styler
    }
  }

  public get Status() {
    return readStylerState(this.accessory.context.device.snapshot?.styler, this.accessory.context.device.deviceModel);
  }
}
