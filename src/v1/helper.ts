import {Device} from '../lib/Device';
import {PlatformType} from '../lib/constants';
import {DeviceModel} from '../lib/DeviceModel';
import AirState from './transforms/AirState';
import WasherDryer from './transforms/WasherDryer';
import {Washer, AC} from './devices';
import RefState from './transforms/RefState';
import Refrigerator from './devices/Refrigerator';

export default class Helper {
  public static make(device: Device) {
    if (device.platform !== PlatformType.ThinQ1) {
      return null;
    }

    switch (device.type) {
      case 'WASHER': return Washer;
      case 'AC': return AC;
      case 'REFRIGERATOR': return Refrigerator;
    }

    return null;
  }

  /**
   * transform device from thinq1 to thinq2 compatible (with snapshot data)
   */
  public static transform(device: Device, deviceModel: DeviceModel, monitorData) {
    if (device.type === PlatformType.ThinQ2) {
      return device;
    }

    switch (device.type) {
      case 'DRYER':
      case 'WASHER':
        device.data.snapshot = WasherDryer(deviceModel, monitorData || {});
        break;
      case 'AC':
        device.data.snapshot = AirState(deviceModel, monitorData || {});
        break;
      case 'REFRIGERATOR':
        device.data.snapshot = RefState(deviceModel, monitorData || {});
        break;
      default:
        // return original device data if not supported
        return device;
    }

    if (monitorData && device.data.snapshot) {
      // mark device online to perform update
      device.data.online = true;
      device.data.snapshot.online = true;
    }

    return device;
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
