import {DeviceModel, ValueType} from '../../lib/DeviceModel';
import {lookupEnumIndex, loopupEnum} from '../helper';

export enum DoorOpenState {
  OPEN = 'OPEN',
  CLOSE = 'CLOSE',
}

export default function RefState(deviceModel: DeviceModel, monitorData) {
  const decodedMonitor = deviceModel.decodeMonitor(monitorData);
  const snapshot = {
    refState: {
      fridgeTemp: decodedMonitor['TempRefrigerator'] || deviceModel.default('TempRefrigerator') || '0',
      freezerTemp: decodedMonitor['TempFreezer'] || deviceModel.default('TempFreezer') || '0',
      atLeastOneDoorOpen: lookupEnumIndex(DoorOpenState, loopupEnum(deviceModel, decodedMonitor, 'DoorOpenState')),
      expressFridge: decodedMonitor['ExpressFridge'] as number,
      tempUnit: decodedMonitor['TempUnit'] as number || 1,
    },
  };

  const fridgeTempValue = deviceModel.value('TempRefrigerator');
  if (fridgeTempValue?.type === ValueType.Enum) {
    snapshot.refState.fridgeTemp = loopupEnum(deviceModel, decodedMonitor, 'TempRefrigerator');
  }

  const freezerTempValue = deviceModel.value('TempFreezer');
  if (freezerTempValue?.type === ValueType.Enum) {
    snapshot.refState.freezerTemp = loopupEnum(deviceModel, decodedMonitor, 'TempFreezer');
  }

  snapshot.refState.fridgeTemp = parseInt(snapshot.refState.fridgeTemp);
  snapshot.refState.freezerTemp = parseInt(snapshot.refState.freezerTemp);

  return snapshot;
}
