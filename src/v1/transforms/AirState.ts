import { DeviceModel, RangeValue } from '../../lib/DeviceModel.js';
import { loopupEnum, safeParseInt, safeParseFloat } from '../helper.js';

export enum ACOperation {
  OFF = '@AC_MAIN_OPERATION_OFF_W',
  /** This one seems to mean "on" ? */
  RIGHT_ON = '@AC_MAIN_OPERATION_RIGHT_ON_W',
  LEFT_ON = '@AC_MAIN_OPERATION_LEFT_ON_W',
  ALL_ON = '@AC_MAIN_OPERATION_ALL_ON_W',
}

export default function AirState(deviceModel: DeviceModel, decodedMonitor: any) {
  const airState: Record<string, any> = {
    'airState.opMode': safeParseInt(decodedMonitor.OpMode),
    'airState.operation': loopupEnum(deviceModel, decodedMonitor, 'Operation') !== ACOperation.OFF,
    'airState.tempState.current': safeParseFloat(decodedMonitor.TempCur),
    'airState.tempState.target': safeParseFloat(decodedMonitor.TempCfg),
    'airState.windStrength': safeParseInt(decodedMonitor.WindStrength),
    'airState.wDir.vStep': safeParseInt(decodedMonitor.WDirVStep),
    'airState.wDir.hStep': safeParseInt(decodedMonitor.WDirHStep),
    'airState.circulate.rotate': safeParseInt(decodedMonitor.CirculateDir),
    'airState.lightingState.signal': safeParseInt(decodedMonitor.SignalLighting),
    'airState.quality.overall': 0,
    'airState.quality.sensorMon': 0,
    'airState.quality.PM1': 0,
    'airState.energy.onCurrent': 0,
  };

  if (deviceModel.value('TempCur')) {

    airState['airState.tempState.current'] = Math.max(airState['airState.tempState.current'], (deviceModel.value('TempCur') as RangeValue).min);
  }

  if (deviceModel.value('TempCfg')) {

    airState['airState.tempState.target'] = Math.max(airState['airState.tempState.target'], (deviceModel.value('TempCfg') as RangeValue).min);
  }

  if (decodedMonitor.TotalAirPolution) {
    airState['airState.quality.overall'] = safeParseInt(decodedMonitor.TotalAirPolution);
  }

  if (decodedMonitor.SensorMon) {
    airState['airState.quality.sensorMon'] = safeParseInt(decodedMonitor.SensorMon);
  }

  if (decodedMonitor.SensorPM1) {
    airState['airState.quality.PM1'] = safeParseInt(decodedMonitor.SensorPM1);
  }

  if (decodedMonitor.SensorPM2) {
    airState['airState.quality.PM2'] = safeParseInt(decodedMonitor.SensorPM2);
  }

  if (decodedMonitor.SensorPM10) {
    airState['airState.quality.PM10'] = safeParseInt(decodedMonitor.SensorPM10);
  }

  if (decodedMonitor.Jet) {
    airState['airState.wMode.jet'] = safeParseInt(decodedMonitor.Jet);
  }

  if (decodedMonitor.SensorHumidity) {
    airState['airState.humidity.current'] = safeParseInt(decodedMonitor.SensorHumidity);
  }

  return airState;
}
