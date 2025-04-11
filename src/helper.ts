import { Categories } from 'homebridge';
import { Device } from './lib/Device';
import AirPurifier from './devices/AirPurifier';
import Refrigerator from './devices/Refrigerator';
import WasherDryer from './devices/WasherDryer';
import Dishwasher from './devices/Dishwasher';
import Dehumidifier from './devices/Dehumidifier';
import { default as V1helper } from './v1/helper';
import { PlatformType } from './lib/constants';
import AirConditioner from './devices/AirConditioner';
import AeroTower from './devices/AeroTower';
import Styler from './devices/Styler';
import RangeHood from './devices/RangeHood';
import Oven from './devices/Oven';
import Microwave from './devices/Microwave';
import WasherDryer2 from './devices/WasherDryer2';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class Helper {
  public static make(device: Device) {
    if (device.platform === PlatformType.ThinQ1) {
      // check if thinq1 available
      return V1helper.make(device);
    }

    // thinq2
    switch (device.type) {
    case 'AERO_TOWER': return AeroTower;
    case 'AIR_PURIFIER': return AirPurifier;
    case 'REFRIGERATOR': return Refrigerator;
    case 'WASHER':
    case 'WASHER_NEW':
    case 'WASH_TOWER':
    case 'DRYER':
      return WasherDryer;
    case 'WASH_TOWER_2': return WasherDryer2; // new kind of washer
    case 'DISHWASHER': return Dishwasher;
    case 'DEHUMIDIFIER': return Dehumidifier;
    case 'AC': return AirConditioner;
    case 'STYLER': return Styler;
    case 'HOOD': return RangeHood;
    case 'MICROWAVE': return Microwave;
    case 'OVEN': return Oven;
    }

    return null;
  }

  public static category(device: Device) {
    switch (device.type) {
    case 'AIR_PURIFIER': return Categories.AIR_PURIFIER;
    case 'DEHUMIDIFIER': return Categories.AIR_DEHUMIDIFIER;
    case 'AC': return Categories.AIR_CONDITIONER;
    case 'DISHWASHER': return 1/*Sprinkler*/;
    case 'OVEN': return 9/*Thermostat*/;
    case 'MICROWAVE': return 9/*air heater*/;
    default: return Categories.OTHER;
    }
  }
}

export function fToC(fahrenheit: number) {
  return parseFloat(((fahrenheit - 32) * 5 / 9).toFixed(1));
}

export function cToF(celsius: number) {
  return Math.round(celsius * 9 / 5 + 32);
}
