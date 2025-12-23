import { Device } from '../lib/Device.js';
import { DeviceModel } from '../lib/DeviceModel.js';
import AirState from './transforms/AirState.js';
import WasherDryer from './transforms/WasherDryer.js';
import { Washer, AC, Refrigerator, AirPurifier, RangeHood } from './devices/index.js';
import RefState from './transforms/RefState.js';
import { randomUUID } from 'crypto';
import AirPurifierState from './transforms/AirPurifierState.js';
import HoodState from './transforms/HoodState.js';

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

    switch (device.type) {
    case 'DRYER':
    case 'WASHER':
      device.data.snapshot = WasherDryer(device.deviceModel, decodedMonitor);
      break;
    case 'AIR_PURIFIER':
      device.data.snapshot = AirPurifierState(device.deviceModel, decodedMonitor);
      break;
    case 'AC':
      device.data.snapshot = AirState(device.deviceModel, decodedMonitor);
      break;
    case 'REFRIGERATOR':
      device.data.snapshot = RefState(device.deviceModel, decodedMonitor);
      break;
    case 'HOOD':
      device.data.snapshot = HoodState(device.deviceModel, decodedMonitor);
      break;
    default:
      // return original device data if not supported
      return device;
    }

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

  public static prepareControlData(device: Device, key: string, value: string) {
    const data: any = {
      cmd: 'Control',
      cmdOpt: 'Set',
      deviceId: device.id,
      workId: randomUUID(),
    };

    if (device.deviceModel.data.ControlWifi?.type === 'BINARY(BYTE)') {
      const sampleData = device.deviceModel.data.ControlWifi?.action?.SetControl?.data || '[]';
      const decodedMonitor = device.snapshot.raw || {};
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

export function loopupEnum(deviceModel: DeviceModel, decodedMonitor: any, key: any) {
  if (!(key in decodedMonitor)) {
    return null;
  }

  return deviceModel.enumName(key, decodedMonitor[key]);
}

export { normalizeBoolean, normalizeNumber } from '../utils/normalize.js';
