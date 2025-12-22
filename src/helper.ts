import { Categories } from 'homebridge';
import { Device } from './lib/Device.js';
import AirPurifier from './devices/AirPurifier.js';
import Refrigerator from './devices/Refrigerator.js';
import WasherDryer from './devices/WasherDryer.js';
import Dishwasher from './devices/Dishwasher.js';
import Dehumidifier from './devices/Dehumidifier.js';
import { default as V1helper } from './v1/helper.js';
import { PlatformType } from './lib/constants.js';
import AirConditioner from './devices/AirConditioner.js';
import AeroTower from './devices/AeroTower.js';
import Styler from './devices/Styler.js';
import RangeHood from './devices/RangeHood.js';
import Oven from './devices/Oven.js';
import Microwave from './devices/Microwave.js';
import WasherDryer2 from './devices/WasherDryer2.js';

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

export function normalizeBoolean(value: any): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value === 1;
  }
  if (typeof value === 'string') {
    const v = value.toLowerCase();
    return v === '1' || v === 'true' || v === 'on';
  }
  return !!value;
}

export function normalizeNumber(value: any): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'number') {
    return value;
  }
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}
