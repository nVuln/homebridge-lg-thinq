import { describe, expect, jest, test } from '@jest/globals';
import type { PlatformConfig } from 'homebridge';
import { NotConnectedError } from './errors/index.js';
import type { Device } from './lib/Device.js';
import { PlatformType } from './lib/constants.js';
import {
  DISCOVERY_RETRY_DELAY_MS,
  isRetryableDiscoveryError,
  prepareDiscoveredDevice,
  unregisterUnsupportedDevice,
} from './platformDiscovery.js';

class FakeDeviceHandler {}

const config = (value: Record<string, unknown> = {}): PlatformConfig => ({
  platform: 'LGThinQ',
  devices: [],
  ...value,
}) as unknown as PlatformConfig;

function fakeDevice(value: Partial<Device> = {}): Device {
  return {
    id: 'device-1',
    name: 'Laundry',
    platform: PlatformType.ThinQ2,
    type: 'WASHER',
    data: {},
    toString: () => 'device-1: Laundry (WASHER)',
    ...value,
  } as unknown as Device;
}

function fakeLog() {
  return {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  } as any;
}

function fakeThinQ(value: Record<string, unknown> = {}) {
  return {
    setup: jest.fn(async () => true),
    unregister: jest.fn(async () => undefined),
    ...value,
  } as any;
}

function fakeAccessoryResolver(make = () => FakeDeviceHandler as any) {
  return {
    make: jest.fn(make),
    category: jest.fn(() => 9),
  };
}

describe('platform discovery helpers', () => {
  test('exposes the existing discovery retry delay', () => {
    expect(DISCOVERY_RETRY_DELAY_MS).toBe(30000);
  });

  test('identifies retryable discovery errors', () => {
    expect(isRetryableDiscoveryError(new NotConnectedError('not connected'))).toBe(true);
    expect(isRetryableDiscoveryError(new Error('other'))).toBe(false);
  });

  test('skips ThinQ1 devices when ThinQ1 support is disabled', async () => {
    const log = fakeLog();
    const thinq = fakeThinQ();
    const result = await prepareDiscoveredDevice({
      log,
      config: config(),
      enableThinQ1: false,
      thinq,
      device: fakeDevice({ platform: PlatformType.ThinQ1 }),
      accessoryResolver: fakeAccessoryResolver(),
    });

    expect(result).toEqual({ status: 'skipped', reason: 'thinq1-disabled' });
    expect(thinq.setup).not.toHaveBeenCalled();
  });

  test('skips devices excluded by explicit config', async () => {
    const log = fakeLog();
    const thinq = fakeThinQ();
    const result = await prepareDiscoveredDevice({
      log,
      config: config({ devices: [{ id: 'other-device' }] }),
      enableThinQ1: true,
      thinq,
      device: fakeDevice(),
      accessoryResolver: fakeAccessoryResolver(),
    });

    expect(result).toEqual({ status: 'skipped', reason: 'config-disabled' });
    expect(log.info).toHaveBeenCalledWith('Device skipped: ', 'device-1');
    expect(thinq.setup).not.toHaveBeenCalled();
  });

  test('reports setup failures without resolving an accessory type', async () => {
    const log = fakeLog();
    const thinq = fakeThinQ({ setup: jest.fn(async () => false) });
    const accessoryResolver = fakeAccessoryResolver();
    const result = await prepareDiscoveredDevice({
      log,
      config: config(),
      enableThinQ1: true,
      thinq,
      device: fakeDevice(),
      accessoryResolver,
    });

    expect(result).toEqual({ status: 'skipped', reason: 'setup-failed' });
    expect(log.warn).toHaveBeenCalledWith('[Laundry] Failed to setup device!');
    expect(accessoryResolver.make).not.toHaveBeenCalled();
  });

  test('unregisters unsupported devices after setup', async () => {
    const log = fakeLog();
    const thinq = fakeThinQ();
    const result = await prepareDiscoveredDevice({
      log,
      config: config(),
      enableThinQ1: true,
      thinq,
      device: fakeDevice(),
      accessoryResolver: {
        make: jest.fn(() => null),
        category: jest.fn(() => 1),
      },
    });

    await Promise.resolve();

    expect(result).toEqual({ status: 'skipped', reason: 'unsupported' });
    expect(thinq.unregister).toHaveBeenCalledWith(expect.objectContaining({ id: 'device-1' }));
    expect(log.debug).toHaveBeenCalledWith('device-1', '- unregistered!');
  });

  test('returns accessory setup information for supported devices', async () => {
    const log = fakeLog();
    const thinq = fakeThinQ();
    const accessoryResolver = fakeAccessoryResolver();
    const result = await prepareDiscoveredDevice({
      log,
      config: config(),
      enableThinQ1: true,
      thinq,
      device: fakeDevice(),
      accessoryResolver,
    });

    expect(result).toEqual({
      status: 'ready',
      accessoryType: FakeDeviceHandler,
      category: 9,
    });
    expect(log.info).toHaveBeenCalledWith('[Laundry] Setting up device!');
  });

  test('keeps unsupported unregister logging in one helper', async () => {
    const log = fakeLog();
    const thinq = fakeThinQ();
    const device = fakeDevice();

    unregisterUnsupportedDevice({ log, thinq, device });
    await Promise.resolve();

    expect(log.info).toHaveBeenCalledWith(
      'Device not supported: ' + PlatformType.ThinQ2 + ': ' + device.toString(),
    );
    expect(thinq.unregister).toHaveBeenCalledWith(device);
    expect(log.debug).toHaveBeenCalledWith('device-1', '- unregistered!');
  });
});
