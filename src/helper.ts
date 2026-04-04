import { Categories } from 'homebridge';
import { Device } from './lib/Device.js';
import AirConditioner from './devices/AirConditioner.js';

export class Helper {
  public static make(device: Device) {
    switch (device.type) {
    case 'AC': return AirConditioner;
    }

    return null;
  }

  public static category(device: Device) {
    switch (device.type) {
    case 'AC': return Categories.AIR_CONDITIONER;
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
export { normalizeBoolean, normalizeNumber } from './utils/normalize.js';
