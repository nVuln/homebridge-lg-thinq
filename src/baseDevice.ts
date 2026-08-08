import { LGThinQHomebridgePlatform } from './platform.js';
import {
  CharacteristicValue,
  Logger,
  PlatformAccessory,
} from 'homebridge';
import { Device } from './lib/Device.js';
import { EventEmitter } from 'events';

export type AccessoryContext = {
  device: Device;
}

export function isDeviceOnlineForHomeKit(device: Pick<Device, 'online'>): boolean {
  return device.online !== false;
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Recursively merges `source` into `target`. LG's ThinQ2 MQTT pushes are partial
// deltas that only carry the fields that changed. A shallow merge replaces nested
// objects (e.g. `washerDryer`) wholesale, dropping fields the delta omits (such as
// `doorLock`) and making the derived characteristics flap. Deep-merging keeps the
// previously known nested values that the delta does not include.
function deepMergeSnapshot(target: any, source: any): any {
  if (!isPlainObject(source)) {
    return source;
  }
  const result: Record<string, any> = isPlainObject(target) ? { ...target } : {};
  for (const key of Object.keys(source)) {
    const sourceValue = source[key];
    result[key] = isPlainObject(sourceValue) && isPlainObject(result[key])
      ? deepMergeSnapshot(result[key], sourceValue)
      : sourceValue;
  }
  return result;
}

export class BaseDevice extends EventEmitter {
  constructor(
    public readonly platform: LGThinQHomebridgePlatform,
    public readonly accessory: PlatformAccessory<AccessoryContext>,
    protected readonly logger: Logger,
  ) {
    super();

    const device: Device = accessory.context.device;
    const { AccessoryInformation } = this.platform.Service;
    const serviceAccessoryInformation = accessory.getService(AccessoryInformation) || accessory.addService(AccessoryInformation);

    // set accessory information
    serviceAccessoryInformation
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'LG')
      .setCharacteristic(this.platform.Characteristic.Model, device.salesModel || device.model || 'Unknown')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, this.config.serial_number || device.serialNumber || 'Unknown');
  }

  public updateAccessoryCharacteristic(device: Device) {
    this.accessory.context.device = device;
  }

  public update(snapshot: any) {
    this.platform.log.debug('[' + this.accessory.context.device.name + '] Received snapshot: ', JSON.stringify(snapshot));
    this.accessory.context.device.data.snapshot = deepMergeSnapshot(this.accessory.context.device.snapshot, snapshot);
    if (typeof snapshot?.online === 'boolean') {
      this.accessory.context.device.data.online = snapshot.online;
    }
    this.updateAccessoryCharacteristic(this.accessory.context.device);
  }

  protected get isOnlineForHomeKit(): boolean {
    return isDeviceOnlineForHomeKit(this.accessory.context.device);
  }

  protected deviceOfflineError() {
    return new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
  }

  protected requireDeviceOnline() {
    if (!this.isOnlineForHomeKit) {
      throw this.deviceOfflineError();
    }
  }

  protected onlineGet<T extends CharacteristicValue>(getter: () => T | Promise<T>): () => T | Promise<T> {
    return () => {
      this.requireDeviceOnline();
      return getter();
    };
  }

  public get config(): Record<string, any> {
    return this.platform.config.devices.find((enabled: Record<string, any>) => enabled.id === this.accessory.context.device.id) || {};
  }

  public static model(): string {
    return '';
  }
}
