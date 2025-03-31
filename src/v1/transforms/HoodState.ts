import { DeviceModel } from '../../lib/DeviceModel';

export default function HoodState(deviceModel: DeviceModel, decodedMonitor) {
  return {
    hoodState: {
      'ventMode': deviceModel.enumName('VentMode', decodedMonitor.VentMode),
      'error': deviceModel.enumName('Error', decodedMonitor.VentMode),
      'ventLevel': parseInt(decodedMonitor.VentLevel || 0),
      'lampSet': decodedMonitor.LampSet,
      'remainTimeMinute': parseInt(decodedMonitor.TimerMin || 0),
      'ventSet': decodedMonitor.VentSet,
      'hoodFotaEnable': parseInt(decodedMonitor.FOTAEnable || 0) ? 'ENABLE' : 'DISABLE',
      'remainTimeSecond': parseInt(decodedMonitor.TimerSec || 0),
      'childLock': parseInt(decodedMonitor.ChildLock || 0) ? 'ENABLE' : 'DISABLE',
      'standyMode': parseInt(decodedMonitor.StandyMode || 0) ? 'ENABLE' : 'DISABLE',
      'lampLevel': parseInt(decodedMonitor.LampLevel || 0),
      'hoodState': parseInt(decodedMonitor.HoodState || 0) ? 'USING' : 'INIT',
    },
  };
}
