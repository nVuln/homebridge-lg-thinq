import { DeviceType } from './constants';

export class Device {
  constructor(public data) {}

  public get id() {
    return this.data.deviceId;
  }

  public get name() {
    return this.data.alias;
  }

  public get type() {
    return DeviceType[this.data.deviceType];
  }

  public get model() {
    return this.data.manufacture?.manufactureModel || this.data.modelName || this.data.modemInfo?.modelName;
  }

  public get macAddress() {
    return this.data.manufacture?.macAddress;
  }

  public get serialNumber() {
    return this.data.manufacture?.serialNo;
  }

  public get firmwareVersion() {
    return this.data.modemInfo?.appVersion;
  }

  public get snapshot() {
    return this.data.snapshot || null;
  }

  public get platform() {
    return this.data.platformType;
  }

  public toString() {
    return `${this.id}: ${this.name} (${this.type} ${this.model})`;
  }
}
