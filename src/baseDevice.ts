import { LGThinQHomebridgePlatform } from './platform.js';
import { HAPStatus, Logger, PlatformAccessory, Service, WithUUID } from 'homebridge';
import { Device } from './lib/Device.js';
import { EventEmitter } from 'events';

type ServiceConstructor = WithUUID<typeof Service>;

export interface DeviceControlPayload {
  dataKey: string | null;
  dataValue: unknown;
  dataSetList?: Record<string, unknown> | null;
  dataGetList?: Record<string, unknown> | null;
}

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
    this.platform.log.debug('[' + this.accessory.context.device.name + '] Received snapshot: ', JSON.stringify(snapshot));
    this.accessory.context.device.data.snapshot = { ...this.accessory.context.device.snapshot, ...snapshot };
    this.updateAccessoryCharacteristic(this.accessory.context.device);
  }

  public get config(): Record<string, any> {
    return this.platform.config.devices.find((enabled: Record<string, any>) => enabled.id === this.accessory.context.device.id) || {};
  }

  /**
   * Helper method to safely control a device with error handling.
   * Wraps ThinQ deviceControl with try/catch and returns success/failure.
   */
  protected async controlDevice(
    payload: DeviceControlPayload,
    onSuccess?: () => void,
  ): Promise<boolean> {
    const device = this.accessory.context.device;
    try {
      const result = await this.platform.ThinQ?.deviceControl(device.id, payload);
      if (result && onSuccess) {
        onSuccess();
      }
      return !!result;
    } catch (error) {
      this.logger.error(`[${device.name}] Device control failed:`, error);
      throw new this.platform.api.hap.HapStatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
  }

  /**
   * Get or create a service with the given type and name.
   * Automatically adds ConfiguredName characteristic.
   */
  protected getOrCreateService(
    serviceType: ServiceConstructor,
    name: string,
    subType?: string,
  ): Service {
    const effectiveSubType = subType || name;
    const service = this.accessory.getService(effectiveSubType)
      || this.accessory.addService(serviceType, name, effectiveSubType);

    // Add ConfiguredName for better HomeKit display
    service.addOptionalCharacteristic(this.platform.Characteristic.ConfiguredName);
    service.updateCharacteristic(this.platform.Characteristic.ConfiguredName, name);

    return service;
  }

  /**
   * Conditionally create or remove a service based on a boolean flag.
   * Returns the service if enabled, undefined if disabled.
   */
  protected ensureService(
    serviceType: ServiceConstructor,
    name: string,
    enabled: boolean,
    subType?: string,
  ): Service | undefined {
    const existingService = subType
      ? this.accessory.getService(subType)
      : this.accessory.getService(serviceType);

    if (enabled) {
      if (!existingService) {
        return this.getOrCreateService(serviceType, name, subType);
      }
      return existingService;
    } else if (existingService) {
      this.accessory.removeService(existingService);
    }

    return undefined;
  }

  public static model(): string {
    return '';
  }
}
