import {DeviceModel, RangeValue} from '../../lib/DeviceModel';
import {loopupEnum} from '../helper';

export enum ACOperation {
  OFF = '@AC_MAIN_OPERATION_OFF_W',
  /** This one seems to mean "on" ? */
  RIGHT_ON = '@AC_MAIN_OPERATION_RIGHT_ON_W',
  LEFT_ON = '@AC_MAIN_OPERATION_LEFT_ON_W',
  ALL_ON = '@AC_MAIN_OPERATION_ALL_ON_W',
}

export default function AirState(deviceModel: DeviceModel, decodedMonitor) {
  const airState = {
    'airState.opMode': parseInt(decodedMonitor['OpMode'] || '0') as number,
    'airState.operation': loopupEnum(deviceModel, decodedMonitor, 'Operation') !== ACOperation.OFF,
    'airState.tempState.current': parseInt(decodedMonitor['TempCur'] || '0') as number,
    'airState.tempState.target': parseInt(decodedMonitor['TempCfg'] || '0') as number,
    'airState.windStrength': parseInt(decodedMonitor['WindStrength'] || '0') as number,
    'airState.wDir.vStep': parseInt(decodedMonitor['WDirVStep'] || '0') as number,
    'airState.wDir.hStep': parseInt(decodedMonitor['WDirHStep'] || '0') as number,
    'airState.circulate.rotate': parseInt(decodedMonitor['CirculateDir']),
    'airState.lightingState.signal': parseInt(decodedMonitor['SignalLighting']),
    'airState.quality.overall': 0,
    'airState.quality.sensorMon': 0,
    'airState.quality.PM1': 0,
  };

  if (deviceModel.value('TempCur')) {
    // eslint-disable-next-line max-len
    airState['airState.tempState.current'] = Math.max(airState['airState.tempState.current'], (deviceModel.value('TempCur') as RangeValue).min);
  }

  if (deviceModel.value('TempCfg')) {
    // eslint-disable-next-line max-len
    airState['airState.tempState.target'] = Math.max(airState['airState.tempState.target'], (deviceModel.value('TempCfg') as RangeValue).min);
  }

  if (decodedMonitor['TotalAirPolution']) {
    airState['airState.quality.overall'] = parseInt(decodedMonitor['TotalAirPolution']);
  }

  if (decodedMonitor['SensorMon']) {
    airState['airState.quality.sensorMon'] = parseInt(decodedMonitor['SensorMon']);
  }

  if (decodedMonitor['SensorPM1']) {
    airState['airState.quality.PM1'] = parseInt(decodedMonitor['SensorPM1']);
  }

  if (decodedMonitor['SensorPM2']) {
    airState['airState.quality.PM2'] = parseInt(decodedMonitor['SensorPM2']);
  }

  if (decodedMonitor['SensorPM10']) {
    airState['airState.quality.PM10'] = parseInt(decodedMonitor['SensorPM10']);
  }

  if (decodedMonitor['Jet']) {
    airState['airState.wMode.jet'] = parseInt(decodedMonitor['Jet']);
  }

  return airState;
}
