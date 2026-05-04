import { EventEmitter } from 'events';
import { describe, expect, jest, test } from '@jest/globals';
import type { PlatformAccessory } from 'homebridge';
import type { AccessoryContext } from './baseDevice.js';
import { ManualProcessNeeded } from './errors/index.js';
import type { Device } from './lib/Device.js';
import { PlatformType } from './lib/constants.js';
import {
  accessoriesForPlatform,
  clearMonitorIntervals,
  emitThinQ2MqttUpdate,
  handleThinQ1PollError,
  hasEnabledThinQ1Accessories,
  pollThinQ1Accessories,
  pollThinQ2Devices,
  startThinQ1Monitor,
  startThinQ2Monitor,
} from './platformMonitor.js';

function fakeDevice(id: string, platform: PlatformType, snapshot: Record<string, unknown> = { raw: {} }): Device {
  return {
    id,
    platform,
    snapshot,
  } as unknown as Device;
}

function fakeAccessory(device: Device): PlatformAccessory<AccessoryContext> {
  return {
    UUID: device.id,
    displayName: device.id,
    context: { device },
  } as unknown as PlatformAccessory<AccessoryContext>;
}

function fakeLog() {
  return {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  } as any;
}

function fakeMonitorThinQ(value: Record<string, unknown> = {}) {
  return {
    devices: jest.fn(async () => []),
    pollMonitor: jest.fn(async (device: Device) => device),
    registerMQTTListener: jest.fn(async () => undefined),
    ...value,
  } as any;
}

describe('platform monitor helpers', () => {
  test('selects monitorable accessories by platform', () => {
    const thinq1 = fakeAccessory(fakeDevice('one', PlatformType.ThinQ1));
    const thinq2 = fakeAccessory(fakeDevice('two', PlatformType.ThinQ2));
    const accessories = [thinq1, thinq2];

    expect(accessoriesForPlatform(accessories, PlatformType.ThinQ1)).toEqual([thinq1]);
    expect(accessoriesForPlatform(accessories, PlatformType.ThinQ2)).toEqual([thinq2]);
    expect(hasEnabledThinQ1Accessories(accessories, true)).toBe(true);
    expect(hasEnabledThinQ1Accessories(accessories, false)).toBe(false);
  });

  test('emits ThinQ2 polling snapshots only for ThinQ2 devices', async () => {
    const events = new EventEmitter();
    const thinq2Listener = jest.fn();
    const thinq1Listener = jest.fn();
    events.on('two', thinq2Listener);
    events.on('one', thinq1Listener);

    await pollThinQ2Devices({
      thinq: {
        devices: jest.fn(async () => [
          fakeDevice('one', PlatformType.ThinQ1, { raw: 'skip' }),
          fakeDevice('two', PlatformType.ThinQ2, { raw: 'emit' }),
        ]),
      },
      events,
    });

    expect(thinq2Listener).toHaveBeenCalledWith({ raw: 'emit' });
    expect(thinq1Listener).not.toHaveBeenCalled();
  });

  test('emits ThinQ2 MQTT reported state for valid monitor messages', () => {
    const events = new EventEmitter();
    const listener = jest.fn();
    events.on('device-1', listener);

    emitThinQ2MqttUpdate(events, {
      deviceId: 'device-1',
      data: {
        state: {
          reported: { power: 'on' },
        },
      },
    });
    emitThinQ2MqttUpdate(events, 'not-a-message');

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ power: 'on' });
  });

  test('polls enabled ThinQ1 accessories and ignores null raw snapshots', async () => {
    const events = new EventEmitter();
    const listener = jest.fn();
    events.on('one', listener);
    events.on('two', listener);

    const thinq = {
      pollMonitor: jest.fn(async (device: Device) => ({
        id: device.id,
        platform: device.platform,
        snapshot: device.id === 'one' ? { raw: { state: 'ready' } } : { raw: null },
      } as unknown as Device)),
    } as any;
    await pollThinQ1Accessories({
      thinq,
      accessories: [
        fakeAccessory(fakeDevice('one', PlatformType.ThinQ1)),
        fakeAccessory(fakeDevice('two', PlatformType.ThinQ1)),
        fakeAccessory(fakeDevice('three', PlatformType.ThinQ2)),
      ],
      events,
      enableThinQ1: true,
    });

    expect(thinq.pollMonitor).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ raw: { state: 'ready' } });
  });

  test('ignores ThinQ1 poll results without a snapshot', async () => {
    const events = new EventEmitter();
    const listener = jest.fn();
    events.on('one', listener);

    await pollThinQ1Accessories({
      thinq: {
        pollMonitor: jest.fn(async (device: Device) => ({
          id: device.id,
          platform: device.platform,
          snapshot: null,
        } as unknown as Device)),
      } as any,
      accessories: [
        fakeAccessory(fakeDevice('one', PlatformType.ThinQ1)),
      ],
      events,
      enableThinQ1: true,
    });

    expect(listener).not.toHaveBeenCalled();
  });

  test('handles ManualProcessNeeded by clearing the ThinQ1 interval', () => {
    const log = fakeLog();
    const interval = setInterval(() => undefined, 1000);
    const monitorIntervals = [interval];

    const handled = handleThinQ1PollError({
      err: new ManualProcessNeeded('manual step needed'),
      log,
      interval,
      monitorIntervals,
    });

    expect(handled).toBe(true);
    expect(monitorIntervals).toEqual([]);
    expect(log.info).toHaveBeenCalledWith('Stop polling device data.');
    expect(log.warn).toHaveBeenCalledWith('manual step needed');
  });

  test('leaves non-manual ThinQ1 polling errors alone', () => {
    const log = fakeLog();
    const interval = setInterval(() => undefined, 1000);
    const monitorIntervals = [interval];

    const handled = handleThinQ1PollError({
      err: new Error('network blip'),
      log,
      interval,
      monitorIntervals,
    });

    clearInterval(interval);
    expect(handled).toBe(false);
    expect(monitorIntervals).toEqual([interval]);
    expect(log.warn).not.toHaveBeenCalled();
  });

  test('starts and clears ThinQ2 monitor resources', async () => {
    const log = fakeLog();
    const events = new EventEmitter();
    const listener = jest.fn();
    const monitorIntervals: ReturnType<typeof setInterval>[] = [];
    events.on('mqtt-device', listener);

    await startThinQ2Monitor({
      log,
      thinq: fakeMonitorThinQ({
        devices: jest.fn(async () => []),
        registerMQTTListener: jest.fn(async (callback: (data: unknown) => void) => {
          callback({
            deviceId: 'mqtt-device',
            data: { state: { reported: { fan: 'low' } } },
          });
        }),
      }),
      events,
      intervalTime: 1000,
      monitorIntervals,
    });

    expect(monitorIntervals).toHaveLength(1);
    expect(log.info).toHaveBeenCalledWith('Start MQTT listener for ThinQ2 devices');
    expect(listener).toHaveBeenCalledWith({ fan: 'low' });

    clearMonitorIntervals(monitorIntervals);
    expect(monitorIntervals).toEqual([]);
  });

  test('starts and clears ThinQ1 monitor resources', () => {
    const log = fakeLog();
    const monitorIntervals: ReturnType<typeof setInterval>[] = [];

    startThinQ1Monitor({
      log,
      thinq: fakeMonitorThinQ(),
      accessories: [],
      events: new EventEmitter(),
      intervalTime: 1000,
      refreshInterval: 1,
      enableThinQ1: true,
      monitorIntervals,
    });

    expect(monitorIntervals).toHaveLength(1);
    expect(log.info).toHaveBeenCalledWith('Start polling device data every 1 seconds.');

    clearMonitorIntervals(monitorIntervals);
    expect(monitorIntervals).toEqual([]);
  });

  test('logs the effective ThinQ1 refresh interval when config is missing', () => {
    const log = fakeLog();
    const monitorIntervals: ReturnType<typeof setInterval>[] = [];

    startThinQ1Monitor({
      log,
      thinq: fakeMonitorThinQ(),
      accessories: [],
      events: new EventEmitter(),
      intervalTime: 5000,
      refreshInterval: undefined,
      enableThinQ1: true,
      monitorIntervals,
    });

    expect(log.info).toHaveBeenCalledWith('Start polling device data every 5 seconds.');

    clearMonitorIntervals(monitorIntervals);
  });
});
