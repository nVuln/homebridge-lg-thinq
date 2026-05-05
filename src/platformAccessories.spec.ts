import { EventEmitter } from 'events';
import { describe, expect, jest, test } from '@jest/globals';
import type { PlatformAccessory } from 'homebridge';
import type { AccessoryContext } from './baseDevice.js';
import {
  createOrRestoreDeviceAccessory,
  findAccessoryForDevice,
  markAccessorySeen,
  pendingAccessoryIds,
  removeStaleAccessories,
  staleAccessories,
  updateAccessoryDisplayName,
} from './platformAccessories.js';
import { DeviceUpdateListenerMap, bindDeviceUpdateListener } from './platformEvents.js';

class FakePlatformAccessory {
  public context: Partial<AccessoryContext> = {};
  public displayName: string;

  constructor(name: string, public UUID: string) {
    this.displayName = name;
  }

  updateDisplayName(name: string) {
    this.displayName = name;
  }
}

class FakeDeviceHandler {
  constructor(
    public platform: any,
    public accessory: PlatformAccessory<AccessoryContext>,
    public log: any,
  ) {}
}

function fakeDevice(id: string, name = 'Device') {
  return {
    id,
    name,
    toString: () => `${name} (${id})`,
  } as any;
}

function fakeApi() {
  return {
    platformAccessory: FakePlatformAccessory,
    registerPlatformAccessories: jest.fn(),
    updatePlatformAccessories: jest.fn(),
    unregisterPlatformAccessories: jest.fn(),
  } as any;
}

function fakeLog() {
  return {
    info: jest.fn(),
  } as any;
}

describe('platform accessory reconciliation', () => {
  test('tracks pending accessory ids without removing the wrong id', () => {
    const accessories = [
      new FakePlatformAccessory('One', 'one'),
      new FakePlatformAccessory('Two', 'two'),
    ] as any;
    const pendingIds = pendingAccessoryIds(accessories);

    markAccessorySeen(pendingIds, 'missing');

    expect([...pendingIds]).toEqual(['one', 'two']);
  });

  test('finds existing accessories by device id', () => {
    const accessory = new FakePlatformAccessory('One', 'one') as any;

    expect(findAccessoryForDevice([accessory], fakeDevice('one'))).toBe(accessory);
    expect(findAccessoryForDevice([accessory], fakeDevice('missing'))).toBeUndefined();
  });

  test('restores existing accessories without registering a new one', () => {
    const api = fakeApi();
    const log = fakeLog();
    const device = fakeDevice('device-1');
    const accessory = new FakePlatformAccessory('Cached', 'device-1') as any;
    const accessories = [accessory];
    const pendingIds = pendingAccessoryIds(accessories);

    const handler = createOrRestoreDeviceAccessory({
      platform: {} as any,
      api,
      log,
      accessories,
      pendingIds,
      device,
      accessoryType: FakeDeviceHandler as any,
      category: 1,
    }) as unknown as FakeDeviceHandler;

    expect(handler.accessory).toBe(accessory);
    expect(accessory.context.device).toBe(device);
    expect(accessory.displayName).toBe('Device');
    expect(pendingIds.has('device-1')).toBe(false);
    expect(api.registerPlatformAccessories).not.toHaveBeenCalled();
    expect(api.updatePlatformAccessories).toHaveBeenCalledWith([accessory]);
    expect(accessories).toHaveLength(1);
  });

  test('updates cached accessory display names when configured names change', () => {
    const api = fakeApi();
    const log = fakeLog();
    const accessory = new FakePlatformAccessory('Old Name', 'device-1') as any;

    const changed = updateAccessoryDisplayName({
      api,
      log,
      accessory,
      name: 'New Name',
    });

    expect(changed).toBe(true);
    expect(accessory.displayName).toBe('New Name');
    expect(log.info).toHaveBeenCalledWith('Updating accessory name:', 'Old Name', '->', 'New Name');
    expect(api.updatePlatformAccessories).toHaveBeenCalledWith([accessory]);
  });

  test('leaves cached accessory display names alone when names already match', () => {
    const api = fakeApi();
    const log = fakeLog();
    const accessory = new FakePlatformAccessory('Same Name', 'device-1') as any;

    const changed = updateAccessoryDisplayName({
      api,
      log,
      accessory,
      name: 'Same Name',
    });

    expect(changed).toBe(false);
    expect(accessory.displayName).toBe('Same Name');
    expect(log.info).not.toHaveBeenCalled();
    expect(api.updatePlatformAccessories).not.toHaveBeenCalled();
  });

  test('creates and registers new accessories', () => {
    const api = fakeApi();
    const log = fakeLog();
    const device = fakeDevice('device-1', 'New Device');
    const accessories: PlatformAccessory<AccessoryContext>[] = [];

    const handler = createOrRestoreDeviceAccessory({
      platform: {} as any,
      api,
      log,
      accessories,
      pendingIds: pendingAccessoryIds(accessories),
      device,
      accessoryType: FakeDeviceHandler as any,
      category: 9,
    }) as unknown as FakeDeviceHandler;

    expect(handler.accessory.UUID).toBe('device-1');
    expect(handler.accessory.context.device).toBe(device);
    expect(accessories).toHaveLength(1);
    expect(api.registerPlatformAccessories).toHaveBeenCalledWith(
      'homebridge-lg-thinq',
      'LGThinQ',
      [handler.accessory],
    );
  });

  test('removes stale accessories and their listeners', () => {
    const api = fakeApi();
    const log = fakeLog();
    const events = new EventEmitter();
    const listeners: DeviceUpdateListenerMap = {};
    const stale = new FakePlatformAccessory('Stale', 'stale') as any;
    const active = new FakePlatformAccessory('Active', 'active') as any;
    const accessories = [stale, active];
    const pendingIds = new Set(['stale']);
    const listener = jest.fn();

    bindDeviceUpdateListener(events, listeners, 'stale', listener);

    const removed = removeStaleAccessories({
      api,
      log,
      accessories,
      events,
      listeners,
      pendingIds,
    });

    events.emit('stale', {});

    expect(removed).toEqual([stale]);
    expect(accessories).toEqual([active]);
    expect(listener).not.toHaveBeenCalled();
    expect(staleAccessories(accessories, pendingIds)).toEqual([]);
    expect(api.unregisterPlatformAccessories).toHaveBeenCalledWith(
      'homebridge-lg-thinq',
      'LGThinQ',
      [stale],
    );
  });
});
