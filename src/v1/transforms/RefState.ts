import {DeviceModel} from '../../lib/DeviceModel';
import {lookupEnumIndex, loopupEnum} from '../helper';

export enum DoorOpenState {
  OPEN = 'OPEN',
  CLOSE = 'CLOSE',
}

export default function RefState(deviceModel: DeviceModel, monitorData) {
  const decodedMonitor = deviceModel.decodeMonitor(monitorData);
  return {
    refState: {
      fridgeTemp: loopupEnum(deviceModel, decodedMonitor, 'TempRefrigerator') || '1',
      freezerTemp: loopupEnum(deviceModel, decodedMonitor, 'TempFreezer') || '1',
      atLeastOneDoorOpen: lookupEnumIndex(DoorOpenState, loopupEnum(deviceModel, decodedMonitor, 'DoorOpenState')),
      expressFridge: decodedMonitor['ExpressFridge'] as number,
      tempUnit: decodedMonitor['TempUnit'] as number || 1,
    },
  };
}
