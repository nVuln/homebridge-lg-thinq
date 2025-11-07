import { DeviceType } from './constants.js';
import { DeviceModel } from './DeviceModel.js';

export interface DeviceData {
  deviceId: string;
  alias: string;
  modelJsonUri: string;
  deviceType: number;
  modelName?: string;
  manufacture?: {
    macAddress?: string;
    salesModel?: string;
    serialNo?: string;
    manufactureModel?: string;
  };
  modemInfo?: {
    appVersion?: string;
    modelName?: string;
  };
  snapshot: {
    online?: boolean;
  } & Record<string,any>;
  platformType?: string;
  online?: boolean;
}

/**
 * Represents a device connected to the LG ThinQ platform.
 * This class provides methods to interact with and retrieve information about the device.
 */
export class Device {
  public deviceModel!: DeviceModel;

  constructor(public data: DeviceData) {}

  /**
   * Gets the unique identifier for the device.
   */
  public get id() {
    return this.data.deviceId;
  }

  /**
   * Gets the name of the device.
   */
  public get name() {
    return this.data.alias;
  }

  /**
   * Gets the type of the device.
   */
  public get type(): string {
    return DeviceType[this.data.deviceType];
  }

  /**
   * Gets the model information for the device.
   */
  public get model() {
    const modelName = this.data.modelName || this.data.modemInfo?.modelName || this.data.manufacture?.manufactureModel || '';
    if (/^([A-Z]+)_(\d+)_([A-Z]{2})$/.test(modelName)) {
      return modelName.slice(0, -3);
    }

    return modelName;
  }

  /**
   * Gets the MAC address of the device.
   */
  public get macAddress() {
    return this.data.manufacture?.macAddress;
  }

  /**
   * Gets the sales model of the device.
   */
  public get salesModel() {
    return this.data.manufacture?.salesModel;
  }

  /**
   * Gets the serial number of the device.
   */
  public get serialNumber() {
    return this.data.manufacture?.serialNo;
  }

  /**
   * Gets the firmware version of the device.
   */
  public get firmwareVersion() {
    return this.data.modemInfo?.appVersion;
  }

  /**
   * Gets the current state snapshot of the device.
   */
  public get snapshot() {
    return this.data.snapshot || null;
  }

  /**
   * Sets the current state snapshot of the device.
   */
  public set snapshot(value) {
    this.data.snapshot = value;
  }

  /**
   * Gets the platform type of the device.
   */
  public get platform() {
    return this.data.platformType;
  }

  /**
   * Gets the online status of the device.
   */
  public get online() {
    return this.data.online !== undefined ? this.data.online : this.data.snapshot.online;
  }

  /**
   * Returns a string representation of the device.
   */
  public toString() {
    return `${this.id}: ${this.name} (${this.type} ${this.model})`;
  }
}
