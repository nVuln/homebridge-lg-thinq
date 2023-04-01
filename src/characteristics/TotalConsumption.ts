import type { WithUUID, Characteristic } from 'homebridge';
import { Formats, Perms } from 'homebridge'; // enum

export default function TotalConsumption(
  DefaultCharacteristic: typeof Characteristic,
): WithUUID<new () => Characteristic> {
  return class TotalConsumption extends DefaultCharacteristic {
    // Eve Energy - Total consumption
    static readonly UUID = 'E863F10C-079E-48FF-8F27-9C2605A29F52';

    constructor() {
      super('Total Consumption', TotalConsumption.UUID, {
        format: Formats.FLOAT,
        unit: 'kWh',
        minValue: 0,
        maxValue: 1000000,
        minStep: 0.01,
        perms: [Perms.PAIRED_READ, Perms.NOTIFY],
      });
    }
  };
}
