import {Device} from '../lib/Device';
import {PlatformType} from '../lib/constants';
import {ChildLock, RemoteStart, SoilWash, WasherState} from './constants';
import {DeviceModel} from '../lib/DeviceModel';

export default class Helper {
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
        device.data.snapshot = {
          washerDryer: Helper.washerDryerSnapshot(deviceModel, monitorData),
        };
        break;
      default:
        // return original device data if not supported
        return device;
    }

    return device;
  }

  private static washerDryerSnapshot(deviceModel: DeviceModel, monitorData) {
    const decodedMonitor = deviceModel.decodeMonitor(monitorData);
    return {
      state: lookupEnumIndex(WasherState, loopupEnum(deviceModel, decodedMonitor, 'State')) || 'POWEROFF',
      preState: lookupEnumIndex(WasherState, loopupEnum(deviceModel, decodedMonitor, 'PreState')) || 'POWEROFF',
      remoteStart: lookupEnumIndex(RemoteStart, loopupEnum(deviceModel, decodedMonitor, 'RemoteStart')) || 'REMOTE_START_OFF',
      initialBit: (decodedMonitor['InitialBit'] || false) as boolean ? 'INITIAL_BIT_ON' : 'INITIAL_BIT_OFF',
      childLock: lookupEnumIndex(ChildLock, loopupEnum(deviceModel, decodedMonitor, 'ChildLock')) || 'CHILDLOCK_OFF',
      doorLock: 'DOOR_LOCK_OFF', // thinq1 not support door lock status
      TCLCount: (decodedMonitor['TCLCount'] || 0) as number,
      reserveTimeHour: (decodedMonitor['Reserve_Time_H'] || 0) as number,
      reserveTimeMinute: (decodedMonitor['Reserve_Time_M'] || 0) as number,
      remainTimeHour: (decodedMonitor['Remain_Time_H'] || 0) as number,
      remainTimeMinute: (decodedMonitor['Remain_Time_M'] || 0) as number,
      initialTimeHour: (decodedMonitor['Initial_Time_H'] || 0) as number,
      initialTimeMinute: (decodedMonitor['Initial_Time_M'] || 0) as number,
      soilWash: lookupEnumIndex(SoilWash, loopupEnum(deviceModel, decodedMonitor, 'Soil')) || 'NO_SOILWASH',
    };
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
