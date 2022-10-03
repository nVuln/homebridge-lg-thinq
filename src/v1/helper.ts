import {Device} from '../lib/Device';
import {PlatformType} from '../lib/constants';
import {DeviceModel} from '../lib/DeviceModel';
import AirState from './transforms/AirState';
import WasherDryer from './transforms/WasherDryer';
import {Washer, AC, Refrigerator, AirPurifier, RangeHood} from './devices';
import RefState from './transforms/RefState';
import * as uuid from 'uuid';
import AirPurifierState from './transforms/AirPurifierState';
import HoodState from './transforms/HoodState';

export default class Helper {
  public static make(device: Device) {
    if (device.platform !== PlatformType.ThinQ1) {
      return null;
    }

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
  public static transform(device: Device, monitorData) {
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
      workId: uuid.v4(),
    };

    if (device.deviceModel.data.ControlWifi?.type === 'BINARY(BYTE)') {
      const sampleData = device.deviceModel.data.ControlWifi?.action?.SetControl?.data || '[]';
      const decodedMonitor = device.snapshot.raw || {};
      decodedMonitor[key] = value;
      // build data array of byte
      const byteArray = new Uint8Array(JSON.parse(Object.keys(decodedMonitor).reduce((prev, key) => {
        return prev.replace(new RegExp('{{'+key+'}}', 'g'), parseInt(decodedMonitor[key] || '0'));
      }, sampleData)));
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

export function lookupEnumIndex(enumType, value) {
  return Object.keys(enumType)[Object.values(enumType).indexOf(<any> value)];
}

export function loopupEnum(deviceModel: DeviceModel, decodedMonitor, key) {
  if (!(key in decodedMonitor)) {
    return null;
  }

  return deviceModel.enumName(key, decodedMonitor[key]);
}
