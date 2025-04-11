import { LGThinQHomebridgePlatform } from './platform.js';
import { Logger, PlatformAccessory } from 'homebridge';
import { Device } from './lib/Device.js';
import { EventEmitter } from 'events';

export type AccessoryContext = {
  device: Device;
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
    const device: Device = this.accessory.context.device;
    this.platform.log.debug('[' + device.name + '] Received snapshot: ', JSON.stringify(snapshot));
    device.data.snapshot = { ...device.snapshot, ...snapshot };
    this.updateAccessoryCharacteristic(device);
  }

  public get config(): Record<string, any> {
    return this.platform.config.devices.find((enabled: Record<string, any>) => enabled.id === this.accessory.context.device.id) || {};
  }

  public static model(): string {
    return '';
  }
}
