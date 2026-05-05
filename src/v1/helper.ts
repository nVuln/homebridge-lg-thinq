import { Device } from '../lib/Device.js';
import { DeviceModel } from '../lib/DeviceModel.js';
import AirState from './transforms/AirState.js';
import WasherDryer from './transforms/WasherDryer.js';
import { Washer, AC, Refrigerator, AirPurifier, RangeHood } from './devices/index.js';
import RefState from './transforms/RefState.js';
import { randomUUID } from 'crypto';
import AirPurifierState from './transforms/AirPurifierState.js';
import HoodState from './transforms/HoodState.js';

export function thinq1SnapshotForDeviceType(deviceType: string, deviceModel: DeviceModel, decodedMonitor: any) {
  switch (deviceType) {
  case 'DRYER':
  case 'WASHER':
    return WasherDryer(deviceModel, decodedMonitor);
  case 'AIR_PURIFIER':
    return AirPurifierState(deviceModel, decodedMonitor);
  case 'AC':
    return AirState(deviceModel, decodedMonitor);
  case 'REFRIGERATOR':
    return RefState(deviceModel, decodedMonitor);
  case 'HOOD':
    return HoodState(deviceModel, decodedMonitor);
  default:
    return null;
  }
}

export default class Helper {
  public static make(device: Device) {
    switch (device.type) {
    case 'DRYER':
    case 'WASHER': return Washer;
    case 'AC': return AC;
    case 'REFRIGERATOR': return Refrigerator;
    case 'AIR_PURIFIER': return AirPurifier;
    case 'HOOD': return RangeHood;
    }

    return null;
  }

  /**
   * transform device from thinq1 to thinq2 compatible (with snapshot data)
   */
  public static transform(device: Device, monitorData: any) {
    const decodedMonitor = device.deviceModel.decodeMonitor(monitorData || {});
    const snapshot = thinq1SnapshotForDeviceType(device.type, device.deviceModel, decodedMonitor);
    if (!snapshot) {
      return device;
    }

    device.data.snapshot = snapshot;

    if (device.data.snapshot) {
      if (monitorData) {
        // mark device online to perform update
        device.data.online = true;
        device.data.snapshot.online = true;
      }

      device.data.snapshot.raw = monitorData === null ? null : decodedMonitor;
    }

    return device;
  }

  public static prepareControlData(device: Device, key: string, value: unknown) {
    const data: any = {
      cmd: 'Control',
      cmdOpt: 'Set',
      deviceId: device.id,
      workId: randomUUID(),
    };

    if (device.deviceModel.data.ControlWifi?.type === 'BINARY(BYTE)') {
      const sampleData = device.deviceModel.data.ControlWifi?.action?.SetControl?.data || '[]';
      const rawSnapshot = device.snapshot?.raw;
      const decodedMonitor = (rawSnapshot && typeof rawSnapshot === 'object') ? { ...rawSnapshot } : {};
      decodedMonitor[key] = value;
      // build data array of byte (coerce booleans and non-numeric values safely)
      let replaced = sampleData;
      for (const p of Object.keys(decodedMonitor)) {
        const raw = decodedMonitor[p];
        let rep: string;
        if (raw === null || raw === undefined) {
          rep = '0';
        } else if (typeof raw === 'boolean') {
          rep = raw ? '1' : '0';
        } else {
          rep = String(raw);
        }
        const num = Number(rep);
        const numVal = Number.isNaN(num) ? 0 : num;
        replaced = replaced.replace(new RegExp('{{' + p + '}}', 'g'), String(numVal));
      }
      const byteArray = new Uint8Array(JSON.parse(replaced));
      Object.assign(data, {
        value: 'ControlData',
        data: Buffer.from(String.fromCharCode(...byteArray)).toString('base64'),
        format: 'B64',
      });
    } else {
      data.value = {
        [key]: value,
      };
      data.data = '';
    }

    return data;
  }
}

export function lookupEnumIndex(enumType: any, value: any) {
  return Object.keys(enumType)[Object.values(enumType).indexOf(<any> value)];
}

export function lookupEnum(deviceModel: DeviceModel, decodedMonitor: any, key: any) {
  if (!(key in decodedMonitor)) {
    return null;
  }

  return deviceModel.enumName(key, decodedMonitor[key]);
}

export const loopupEnum = lookupEnum;

export { normalizeBoolean, normalizeNumber } from '../utils/normalize.js';
