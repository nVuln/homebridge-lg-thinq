import { AccessoryContext, BaseDevice } from '../baseDevice.js';
import { LGThinQHomebridgePlatform } from '../platform.js';
import { CharacteristicValue, Logger, PlatformAccessory, Service } from 'homebridge';
import { Device } from '../lib/Device.js';
import { DeviceModel } from '../lib/DeviceModel.js';
import { STYLER_NOT_RUNNING_STATUS, ONE_DAY_IN_SECONDS } from '../lib/constants.js';
import { toSeconds } from '../utils/normalize.js';

/** @deprecated Use STYLER_NOT_RUNNING_STATUS from lib/constants.js instead */
export const NOT_RUNNING_STATUS = STYLER_NOT_RUNNING_STATUS;

export default class Styler extends BaseDevice {
  protected serviceStyler: Service;

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

    this.serviceStyler = this.getOrCreateService(Valve, device.name);
    this.serviceStyler.getCharacteristic(Characteristic.Active)
      .onSet(this.setActive.bind(this))
      .updateValue(Characteristic.Active.INACTIVE);
    this.serviceStyler.setCharacteristic(Characteristic.Name, device.name);
    this.serviceStyler.setCharacteristic(Characteristic.ValveType, Characteristic.ValveType.GENERIC_VALVE);
    this.serviceStyler.setCharacteristic(Characteristic.InUse, Characteristic.InUse.NOT_IN_USE);
    this.serviceStyler.getCharacteristic(Characteristic.RemainingDuration).setProps({
      maxValue: ONE_DAY_IN_SECONDS,
    });
  }

  public updateAccessoryCharacteristic(device: Device) {
    super.updateAccessoryCharacteristic(device);

    const {
      Characteristic,
    } = this.platform;
    this.serviceStyler.updateCharacteristic(Characteristic.Active, this.Status.isPowerOn ? 1 : 0);
    this.serviceStyler.updateCharacteristic(Characteristic.InUse, this.Status.isRunning ? 1 : 0);
    const prevRemainDuration = this.serviceStyler.getCharacteristic(Characteristic.RemainingDuration).value;
    if (this.Status.remainDuration !== prevRemainDuration) {
      this.serviceStyler.updateCharacteristic(Characteristic.RemainingDuration, this.Status.remainDuration);
    }

    this.serviceStyler.updateCharacteristic(Characteristic.StatusFault,
      this.Status.isError ? Characteristic.StatusFault.GENERAL_FAULT : Characteristic.StatusFault.NO_FAULT);
  }

  async setActive(value: CharacteristicValue) {
    void value;
    if (this.Status.isRemoteStartOn) {
      // turn on styler
    }
  }

  public get Status() {
    return new StylerStatus(this.accessory.context.device.snapshot?.styler, this.accessory.context.device.deviceModel);
  }
}

class StylerStatus {
  constructor(protected data: any, protected deviceModel: DeviceModel) { }

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
      remainingDuration = toSeconds(remainTimeHour, remainTimeMinute);
    }

    return remainingDuration;
  }
}
