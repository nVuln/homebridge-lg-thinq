import {DeviceModel} from '../../lib/DeviceModel';
import {loopupEnum} from '../helper';

export enum ACOperation {
  OFF = '@AC_MAIN_OPERATION_OFF_W',
  /** This one seems to mean "on" ? */
  RIGHT_ON = '@AC_MAIN_OPERATION_RIGHT_ON_W',
  LEFT_ON = '@AC_MAIN_OPERATION_LEFT_ON_W',
  ALL_ON = '@AC_MAIN_OPERATION_ALL_ON_W',
}

export default function AirState(deviceModel: DeviceModel, monitorData) {
  const decodedMonitor = deviceModel.decodeMonitor(monitorData);
  const airState = {
    'airState.opMode': (decodedMonitor['OpMode'] || 0) as number,
    'airState.operation': loopupEnum(deviceModel, decodedMonitor, 'Operation') !== ACOperation.OFF,
    'airState.tempState.current': (decodedMonitor['TempCur'] || 0) as number,
    'airState.tempState.target': (decodedMonitor['TempCfg'] || 0) as number,
    'airState.windStrength': (decodedMonitor['WindStrength'] || 0) as number,
    'airState.wDir.vStep': (decodedMonitor['WDirVStep'] || 0) as number,
    'airState.wDir.hStep': (decodedMonitor['WDirHStep'] || 0) as number,

    'airState.quality.overall': 0, // unknown
  };

  if (decodedMonitor['SensorMon']) {
    airState['airState.quality.sensorMon'] = decodedMonitor['SensorMon'] || 0;
  }

  if (decodedMonitor['SensorPM1']) {
    airState['airState.quality.PM1'] = decodedMonitor['SensorPM1'];
  }

  if (decodedMonitor['SensorPM2']) {
    airState['airState.quality.PM2'] = decodedMonitor['SensorPM2'] || 0;
  }

  if (decodedMonitor['SensorPM10']) {
    airState['airState.quality.PM10'] = decodedMonitor['SensorPM10'];
  }

  console.log('Debug - AC decoded data: ', decodedMonitor);

  return airState;
}
