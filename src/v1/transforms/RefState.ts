import { DeviceModel } from '../../lib/DeviceModel.js';
import { lookupEnumIndex, loopupEnum, safeParseInt } from '../helper.js';

export enum DoorOpenState {
  OPEN = 'OPEN',
  CLOSE = 'CLOSE',
}

export default function RefState(deviceModel: DeviceModel, decodedMonitor: any) {
  const snapshot: Record<string, any> = {
    refState: {
      fridgeTemp: decodedMonitor.TempRefrigerator || deviceModel.default('TempRefrigerator') || '0',
      freezerTemp: decodedMonitor.TempFreezer || deviceModel.default('TempFreezer') || '0',

      atLeastOneDoorOpen: lookupEnumIndex(DoorOpenState, loopupEnum(deviceModel, decodedMonitor, 'DoorOpenState') || deviceModel.default('DoorOpenState')),
      tempUnit: safeParseInt(decodedMonitor.TempUnit || deviceModel.default('TempUnit')) ? 'CELSIUS' : 'FAHRENHEIT',
    },
  };

  snapshot.refState.fridgeTemp = safeParseInt(snapshot.refState.fridgeTemp);
  snapshot.refState.freezerTemp = safeParseInt(snapshot.refState.freezerTemp);

  if ('IcePlus' in decodedMonitor) {
    snapshot.refState.expressMode = decodedMonitor.IcePlus || deviceModel.default('IcePlus') || '0';
  }

  if ('ExpressFridge' in decodedMonitor) {
    snapshot.refState.expressFridge = decodedMonitor.ExpressFridge || deviceModel.default('ExpressFridge') || '0';
  }

  if ('EcoFriendly' in decodedMonitor) {
    snapshot.refState.ecoFriendly = decodedMonitor.EcoFriendly || deviceModel.default('EcoFriendly') || '0';
  }

  return snapshot;
}
