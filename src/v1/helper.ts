import {Device} from '../lib/Device';
import {PlatformType} from '../lib/constants';
import {ChildLock, RemoteStart, SoilWash, WasherState} from './constants';
import {DeviceModel} from '../lib/DeviceModel';

export default class Helper {
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
    }

    // mark device as thinq2 compatible
    device.data.platformType = PlatformType.ThinQ2;

    return device;
  }

  private static washerDryerSnapshot(deviceModel: DeviceModel, monitorData) {
    const decodedMonitor = deviceModel.decodeMonitor(monitorData);
    return {
      state: WasherState[loopupEnum(deviceModel, decodedMonitor, 'State')],
      preState: WasherState[loopupEnum(deviceModel, decodedMonitor, 'PreState')],
      remoteStart: RemoteStart[loopupEnum(deviceModel, decodedMonitor, 'RemoteStart')],
      initialBit: decodedMonitor['InitialBit'] as boolean ? 'INITIAL_BIT_ON' : 'INITIAL_BIT_OFF',
      childLock: ChildLock[loopupEnum(deviceModel, decodedMonitor, 'ChildLock')],
      TCLCount: decodedMonitor['TCLCount'] as number,
      reserveTimeHour: decodedMonitor['Reserve_Time_H'] as number,
      reserveTimeMinute: decodedMonitor['Reserve_Time_M'] as number,
      remainTimeHour: decodedMonitor['Remain_Time_H'] as number,
      remainTimeMinute: decodedMonitor['Remain_Time_M'] as number,
      initialTimeHour: decodedMonitor['Initial_Time_H'] as number,
      initialTimeMinute: decodedMonitor['Initial_Time_M'] as number,
      soilWash: SoilWash[loopupEnum(deviceModel, decodedMonitor, 'Soil')],
    };
  }
}

export function loopupEnum(deviceModel: DeviceModel, decodedMonitor, key) {
  if (!(key in decodedMonitor)) {
    return null;
  }

  return deviceModel.enumName(key, decodedMonitor[key]);
}
