import AirState from './AirState.js';
import { DeviceModel } from '../../lib/DeviceModel.js';
import { safeParseInt } from '../helper.js';

export default function AirPurifierState(deviceModel: DeviceModel, decodedMonitor: any) {
  const airState = AirState(deviceModel, decodedMonitor);

  airState['airState.operation'] = !!safeParseInt(decodedMonitor.Operation);
  airState['airState.miscFuncState.airFast'] = !!safeParseInt(decodedMonitor.AirFast);

  return airState;
}
