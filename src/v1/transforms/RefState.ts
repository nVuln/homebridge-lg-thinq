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
      // eslint-disable-next-line max-len
      atLeastOneDoorOpen: lookupEnumIndex(DoorOpenState, loopupEnum(deviceModel, decodedMonitor, 'DoorOpenState') || deviceModel.default('DoorOpenState')),
      tempUnit: parseInt(decodedMonitor['TempUnit'] || deviceModel.default('TempUnit')) ? 'CELSIUS' : 'FAHRENHEIT',
    },
  };

  const fridgeTempValue = deviceModel.value('TempRefrigerator');
  if (fridgeTempValue?.type === ValueType.Enum) {
    snapshot.refState.fridgeTemp = loopupEnum(deviceModel, decodedMonitor, 'TempRefrigerator') || snapshot.refState.fridgeTemp;
  }

  const freezerTempValue = deviceModel.value('TempFreezer');
  if (freezerTempValue?.type === ValueType.Enum) {
    snapshot.refState.freezerTemp = loopupEnum(deviceModel, decodedMonitor, 'TempFreezer') || snapshot.refState.freezerTemp;
  }

  snapshot.refState.fridgeTemp = parseInt(snapshot.refState.fridgeTemp);
  snapshot.refState.freezerTemp = parseInt(snapshot.refState.freezerTemp);

  if ('ExpressFridge' in decodedMonitor) {
    snapshot.refState['expressFridge'] = parseInt(decodedMonitor['ExpressFridge']);
  }

  return snapshot;
}
