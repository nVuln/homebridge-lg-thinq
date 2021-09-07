import {DeviceModel} from '../../lib/DeviceModel';
import {lookupEnumIndex, loopupEnum} from '../helper';

export enum WasherState {
  POWEROFF = '@WM_STATE_POWER_OFF_W',
  INITIAL = '@WM_STATE_INITIAL_W',
  PAUSE = '@WM_STATE_PAUSE_W',
  RESERVED = '@WM_STATE_RESERVE_W',
  DETECTING = '@WM_STATE_DETECTING_W',
  RUNNING = '@WM_STATE_RUNNING_W',
  RINSING = '@WM_STATE_RINSING_W',
  SPINNING = '@WM_STATE_SPINNING_W',
  DRYING = '@WM_STATE_DRYING_W',
  END = '@WM_STATE_END_W',
  COOLDOWN = '@WM_STATE_COOLDOWN_W',
  RINSEHOLD = '@WM_STATE_RINSEHOLD_W',
  WASH_REFRESHING = '@WM_STATE_WASH_REFRESHING_W',
  STEAMSOFTENING = '@WM_STATE_STEAMSOFTENING_W',
  ERROR = '@WM_STATE_ERROR_W'
}

export enum RemoteStart {
  REMOTE_START_OFF = '@CP_OFF_EN_W',
  REMOTE_START_ON = '@CP_ON_EN_W',
}

export enum ChildLock {
  CHILDLOCK_OFF = '@CP_OFF_EN_W',
  CHILDLOCK_ON = '@CP_ON_EN_W',
}

export enum SoilWash {
  NO_SOILWASH = '-',
  SOILWASH_TURBO_WASH = '@WM_FL24_TITAN_SOIL_LIGHT_W',
  SOILWASH_TIMESAVE = '@WM_FL24_TITAN_SOIL_NORMAL_W',
  SOILWASH_NORMAL = '@WM_FL24_TITAN_SOIL_HEAVY_W'
}

export default function WasherDryer(deviceModel: DeviceModel, decodedMonitor) {
  return {
    washerDryer: {
      state: lookupEnumIndex(WasherState, loopupEnum(deviceModel, decodedMonitor, 'State')) || 'POWEROFF',
      preState: lookupEnumIndex(WasherState, loopupEnum(deviceModel, decodedMonitor, 'PreState')) || 'POWEROFF',
      remoteStart: lookupEnumIndex(RemoteStart, loopupEnum(deviceModel, decodedMonitor, 'RemoteStart')) || 'REMOTE_START_OFF',
      initialBit: (decodedMonitor['InitialBit'] || false) as boolean ? 'INITIAL_BIT_ON' : 'INITIAL_BIT_OFF',
      childLock: lookupEnumIndex(ChildLock, loopupEnum(deviceModel, decodedMonitor, 'ChildLock')) || 'CHILDLOCK_OFF',
      TCLCount: (decodedMonitor['TCLCount'] || 0) as number,
      reserveTimeHour: (decodedMonitor['Reserve_Time_H'] || 0) as number,
      reserveTimeMinute: (decodedMonitor['Reserve_Time_M'] || 0) as number,
      remainTimeHour: (decodedMonitor['Remain_Time_H'] || 0) as number,
      remainTimeMinute: (decodedMonitor['Remain_Time_M'] || 0) as number,
      initialTimeHour: (decodedMonitor['Initial_Time_H'] || 0) as number,
      initialTimeMinute: (decodedMonitor['Initial_Time_M'] || 0) as number,
      soilWash: lookupEnumIndex(SoilWash, loopupEnum(deviceModel, decodedMonitor, 'Soil')) || 'NO_SOILWASH',
    },
  };
}
