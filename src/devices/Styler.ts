import { baseDevice } from '../baseDevice';
import { LGThinQHomebridgePlatform } from '../platform';
import { CharacteristicValue, Logger, Perms, PlatformAccessory } from 'homebridge';
import { Device } from '../lib/Device';
import { DeviceModel } from '../lib/DeviceModel';

export const NOT_RUNNING_STATUS = ['POWEROFF', 'INITIAL', 'PAUSE', 'COMPLETE', 'ERROR', 'DIAGNOSIS', 'RESERVED',
  'SLEEP', 'FOTA'];

export default class Styler extends baseDevice {
  protected serviceStyter;

  constructor(
    public readonly platform: LGThinQHomebridgePlatform,
    public readonly accessory: PlatformAccessory,
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
      .onSet(this.setActive.bind(this))
      .updateValue(Characteristic.Active.INACTIVE);
    this.serviceStyter.setCharacteristic(Characteristic.Name, device.name);
    this.serviceStyter.setCharacteristic(Characteristic.ValveType, Characteristic.ValveType.GENERIC_VALVE);
    this.serviceStyter.setCharacteristic(Characteristic.InUse, Characteristic.InUse.NOT_IN_USE);
    this.serviceStyter.getCharacteristic(Characteristic.RemainingDuration).setProps({
      maxValue: 86400, // 1 day
    });
  }

  public updateAccessoryCharacteristic(device: Device) {
    super.updateAccessoryCharacteristic(device);

    const {
      Characteristic,
    } = this.platform;
    this.serviceStyter.updateCharacteristic(Characteristic.Active, this.Status.isPowerOn ? 1 : 0);
    this.serviceStyter.updateCharacteristic(Characteristic.InUse, this.Status.isRunning ? 1 : 0);
    const prevRemainDuration = this.serviceStyter.getCharacteristic(Characteristic.RemainingDuration).value;
    if (this.Status.remainDuration !== prevRemainDuration) {
      this.serviceStyter.updateCharacteristic(Characteristic.RemainingDuration, this.Status.remainDuration);
    }

    this.serviceStyter.updateCharacteristic(Characteristic.StatusFault,
      this.Status.isError ? Characteristic.StatusFault.GENERAL_FAULT : Characteristic.StatusFault.NO_FAULT);
  }

  async setActive(value: CharacteristicValue) {
    if (this.Status.isRemoteStartOn) {
      // turn on styler
    }
  }

  public get Status() {
    return new StylerStatus(this.accessory.context.device.snapshot?.styler, this.accessory.context.device.deviceModel);
  }
}

class StylerStatus {
  constructor(protected data, protected deviceModel: DeviceModel) { }

  public get isPowerOn() {
    return !['POWEROFF', 'POWERFAIL'].includes(this.data?.state);
  }

  public get isRemoteStartOn() {
    return this.data.remoteStart === this.deviceModel.lookupMonitorName('remoteStart', '@CP_ON_EN_W');
  }

  public get isRunning() {
    return this.isPowerOn && !NOT_RUNNING_STATUS.includes(this.data?.state);
  }

  public get isError() {
    return this.data?.state === 'ERROR';
  }

  public get remainDuration() {
    const remainTimeHour = this.data?.remainTimeHour || 0,
      remainTimeMinute = this.data?.remainTimeMinute || 0;

    let remainingDuration = 0;
    if (this.isRunning) {
      remainingDuration = remainTimeHour * 3600 + remainTimeMinute * 60;
    }

    return remainingDuration;
  }
}
