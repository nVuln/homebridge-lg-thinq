import { DeviceType } from './constants';
import {DeviceModel} from './DeviceModel';

export class Device {
  public deviceModel!: DeviceModel;
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
    const modelName = this.data.modelName || this.data.modemInfo?.modelName || this.data.manufacture?.manufactureModel;
    if (/^([A-Z]+)_(\d+)_([A-Z]{2})$/.test(modelName)) {
      return modelName.slice(0, -3);
    }

    return modelName;
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

  public set snapshot(value) {
    this.data.snapshot = value;
  }

  public get platform() {
    return this.data.platformType;
  }

  public get online() {
    return this.data.online || this.data.snapshot.online;
  }

  public toString() {
    return `${this.id}: ${this.name} (${this.type} ${this.model})`;
  }
}
