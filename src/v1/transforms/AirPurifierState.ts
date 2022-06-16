import AirState from './AirState';
import {DeviceModel} from '../../lib/DeviceModel';

export default function AirPurifierState(deviceModel: DeviceModel, decodedMonitor) {
  const airState = AirState(deviceModel, decodedMonitor);

  airState['airState.operation'] = !!parseInt(decodedMonitor['Operation']);
  airState['airState.miscFuncState.airFast'] = !!parseInt(decodedMonitor['AirFast']);

  return airState;
}
