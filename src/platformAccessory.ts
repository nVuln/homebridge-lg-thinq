import { Categories } from 'homebridge';
import {Device} from './lib/Device';
import AirPurifier from './devices/AirPurifier';
import Refrigerator from './devices/Refrigerator';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class LGThinQPlatformAccessory {
  public static make(device: Device) {
    switch (device.type) {
      case 'AIR_PURIFIER': return AirPurifier;
      case 'REFRIGERATOR': return Refrigerator;
    }

    return null;
  }

  public static category(device: Device) {
    switch (device.type) {
      case 'AIR_PURIFIER': return Categories.AIR_PURIFIER;
      default: return Categories.OTHER;
    }
  }
}
