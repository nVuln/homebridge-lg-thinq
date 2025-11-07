import type {
  Characteristic as CharacteristicType,
  WithUUID,
} from 'homebridge';

import TotalConsumption from './TotalConsumption.js';

export default function characteristic(
  Characteristic: typeof CharacteristicType,
): Record<
  | 'TotalConsumption',
  WithUUID<new () => CharacteristicType>
> {

  return {
    TotalConsumption: TotalConsumption(Characteristic),
  };
}
