import {DeviceModel} from '../../lib/DeviceModel';
import {loopupEnum} from '../helper';

export enum ACOperation {
  OFF = '@AC_MAIN_OPERATION_OFF_W',
  /** This one seems to mean "on" ? */
  RIGHT_ON = '@AC_MAIN_OPERATION_RIGHT_ON_W',
  LEFT_ON = '@AC_MAIN_OPERATION_LEFT_ON_W',
  ALL_ON = '@AC_MAIN_OPERATION_ALL_ON_W',
}

/**
Debug - AC decoded data:  {
  Operation: '1',
  OpMode: '8',
  WindStrength: '2',
  TempUnit: 'NS',
  TempCur: '24',
  TempCfg: '23.5',
  GroupType: '9',
  SleepTime: '0',
  OnTime: '0',
  OffTime: '0',
  RacAddFunc: 'NS',
  ExtraOp: '0',
  DiagCode: '00',
  TimeBsOn: '0',
  TimeBsOff: '0',
  AirClean: '0',
  AutoDry: '0',
  PowerSave: '0',
  WDirVStep: '0',
  WDirHStep: '0',
  TempLimitMax: '0',
  TempLimitMin: '0',
  DuctZoneType: '0',
  ZoneControl: '0',
  DRED: '0',
  SensorPM1: '0',
  SensorPM2: '0',
  SensorPM10: '0',
  AirPolution: '0',
  HumidityCfg: '0',
  WaterTempCoolMin: '0',
  WaterTempCoolMax: '0',
  WaterTempHeatMin: '0',
  WaterTempHeatMax: '0',
  HotWaterTempMin: '0',
  HotWaterTempMax: '0',
  SensorHumidity: '0',
  TotalAirPolution: '0',
  SensorMon: '0',
  CleanDry: '0',
  ProductStatus: '0',
  AirMonitoring: '0',
  Humidification: '0',
  AirFast: '0',
  AirRemoval: '0',
  AirUVDisinfection: '0',
  WatertankLight: '0',
  SignalLighting: '0',
  WDirUpDown: '0',
  WDirLeftRight: '0',
  WSwirl: '0',
  Jet: '0',
  LowHeating: '0',
  CirculateStrength: '0',
  CirculateDir: '0',
  AntiBugs: '0',
  IceValley: '0',
  Humsave: '0',
  WaterTempCur: '0',
  HotWaterTempCur: '0',
  HotWaterTempCfg: '0',
  HotWaterMode: '0',
  HotWater: '0',
  AWHPTempCfgSwitch: '0',
  AirTempCoolMin: '0',
  AirTempCoolMax: '0',
  AirTempHeatMin: '0',
  AirTempHeatMax: '0',
  WaterInTempCur: '0',
  AWHPWATempControlSta: '0',
  DisplayControl: '0',
  SmartCare: '0',
  TwoSetCoolTemp: '0',
  TwoSetHeatTemp: '0',
  TwoSetCoolUSL: '0',
  TwoSetCoolLSL: '0',
  TwoSetHeatUSL: '0',
  TwoSetHeatLSL: '0',
  TwoSetACOState: '0',
  TwoSetModeDeadband: '0',
  TwoSetState: '0'
}
 */
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

  return airState;
}
