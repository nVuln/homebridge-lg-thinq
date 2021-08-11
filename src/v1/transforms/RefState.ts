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
      fridgeTemp: loopupEnum(deviceModel, decodedMonitor, 'TempRefrigerator'),
      freezerTemp: loopupEnum(deviceModel, decodedMonitor, 'TempFreezer'),
      atLeastOneDoorOpen: lookupEnumIndex(DoorOpenState, loopupEnum(deviceModel, decodedMonitor, 'DoorOpenState')),
      expressFridge: deviceModel['ExpressFridge'] as number,
      tempUnit: deviceModel['TempUnit'] as number,
    },
  };
}
