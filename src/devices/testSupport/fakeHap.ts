import { jest } from '@jest/globals';

/**
 * Minimal fake HAP Characteristic: enough to register onGet/onSet handlers
 * and track the last value Homebridge would have cached, without any real
 * HAP machinery. Not a faithful HAP reimplementation -- just enough surface
 * for a device constructor to run and for tests to drive onSet/onGet and
 * read what updateCharacteristic() last pushed.
 */
export class FakeCharacteristic {
  value: unknown;
  private getHandler?: () => unknown;
  private setHandler?: (value: unknown) => unknown;

  onGet(fn: () => unknown) {
    this.getHandler = fn;
    return this;
  }

  onSet(fn: (value: unknown) => unknown) {
    this.setHandler = fn;
    return this;
  }

  setProps() {
    return this;
  }

  /** Simulates HomeKit reading this characteristic. */
  async triggerGet(): Promise<unknown> {
    if (!this.getHandler) {
      return this.value;
    }
    this.value = await this.getHandler();
    return this.value;
  }

  /** Simulates HomeKit writing this characteristic. */
  async triggerSet(value: unknown): Promise<void> {
    if (this.setHandler) {
      await this.setHandler(value);
    }
  }
}

/** Minimal fake HAP Service: a bag of FakeCharacteristics keyed by whatever
 * reference the device code used to look them up (a string in the test
 * platform's Characteristic map). */
export class FakeService {
  private characteristics = new Map<string, FakeCharacteristic>();

  constructor(public readonly UUID: string = '', public readonly subtype?: string) {}

  getCharacteristic(ref: unknown): FakeCharacteristic {
    const key = String(ref);
    let characteristic = this.characteristics.get(key);
    if (!characteristic) {
      characteristic = new FakeCharacteristic();
      this.characteristics.set(key, characteristic);
    }
    return characteristic;
  }

  setCharacteristic(ref: unknown, value: unknown) {
    this.getCharacteristic(ref).value = value;
    return this;
  }

  updateCharacteristic(ref: unknown, value: unknown) {
    this.getCharacteristic(ref).value = value;
    return this;
  }

  addOptionalCharacteristic() {
    return this;
  }

  setPrimaryService() {
    return this;
  }

  addLinkedService() {
    return this;
  }
}

/**
 * Fake accessory: tracks FakeServices by whatever name/type the device code
 * used, so the common `getService(name) || addService(type, name, subtype)`
 * pattern works the same way it does against real HAP.
 */
export function createFakeAccessory() {
  const services = new Map<string, FakeService>();
  // Same services, in the order they were added, which is what a real
  // PlatformAccessory exposes as `accessory.services`.
  const serviceList: FakeService[] = [];

  function keyFor(nameOrType: unknown, name?: unknown) {
    return String(name ?? nameOrType);
  }

  const getService = jest.fn((nameOrType: unknown) => services.get(keyFor(nameOrType)));
  // Real HAP looks a service up by type AND subtype. The fake keys services by
  // the name they were added under, so this ignores the type and matches on the
  // subtype recorded at addService() time.
  const getServiceById = jest.fn((_type: unknown, subtype: string) => serviceList.find(service => service.subtype === subtype));
  const addService = jest.fn((type: unknown, name?: unknown, subtype?: string) => {
    const service = new FakeService(String(type), subtype);
    services.set(keyFor(type, name), service);
    serviceList.push(service);
    return service;
  });
  const removeService = jest.fn((service: FakeService) => {
    const index = serviceList.indexOf(service);
    if (index !== -1) {
      serviceList.splice(index, 1);
    }
    for (const [key, candidate] of services) {
      if (candidate === service) {
        services.delete(key);
      }
    }
  });

  return { getService, getServiceById, addService, removeService, services, serviceList };
}

/** Characteristic references are plain strings (or small lookup objects for the
 * enum-like ones), matched against FakeService's string-keyed lookup -- there is
 * no real HAP here. */
export const CHARACTERISTIC = {
  Active: 'Active',
  ActiveIdentifier: 'ActiveIdentifier',
  Brightness: 'Brightness',
  ConfiguredName: 'ConfiguredName',
  CurrentHeatingCoolingState: 'CurrentHeatingCoolingState',
  CurrentRelativeHumidity: 'CurrentRelativeHumidity',
  CurrentTemperature: 'CurrentTemperature',
  CurrentVisibilityState: { SHOWN: 'SHOWN', HIDDEN: 'HIDDEN' },
  Identifier: 'Identifier',
  InputSourceType: { APPLICATION: 'APPLICATION' },
  InUse: { IN_USE: 'IN_USE', NOT_IN_USE: 'NOT_IN_USE' },
  IsConfigured: { CONFIGURED: 'CONFIGURED' },
  Manufacturer: 'Manufacturer',
  Model: 'Model',
  Name: 'Name',
  On: 'On',
  RemainingDuration: 'RemainingDuration',
  RotationSpeed: 'RotationSpeed',
  SerialNumber: 'SerialNumber',
  SetDuration: 'SetDuration',
  SleepDiscoveryMode: { ALWAYS_DISCOVERABLE: 'ALWAYS_DISCOVERABLE' },
  StatusFault: 'StatusFault',
  TargetHeatingCoolingState: { OFF: 'OFF', HEAT: 'HEAT' },
  TargetTemperature: 'TargetTemperature',
  TargetVisibilityState: { SHOWN: 'SHOWN', HIDDEN: 'HIDDEN' },
  TemperatureDisplayUnits: 'TemperatureDisplayUnits',
  ValveType: { IRRIGATION: 'IRRIGATION' },
} as const;

export const SERVICE = {
  AccessoryInformation: 'AccessoryInformation',
  Fanv2: 'Fanv2',
  InputSource: 'InputSource',
  Lightbulb: 'Lightbulb',
  Switch: 'Switch',
  Television: 'Television',
  Thermostat: 'Thermostat',
  Valve: 'Valve',
} as const;

