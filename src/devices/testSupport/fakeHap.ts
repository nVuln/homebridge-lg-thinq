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

  function keyFor(nameOrType: unknown, name?: unknown) {
    return String(name ?? nameOrType);
  }

  const getService = jest.fn((nameOrType: unknown) => services.get(keyFor(nameOrType)));
  const addService = jest.fn((type: unknown, name?: unknown) => {
    const service = new FakeService();
    services.set(keyFor(type, name), service);
    return service;
  });

  return { getService, addService, services };
}
