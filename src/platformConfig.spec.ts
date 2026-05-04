import { describe, expect, test } from '@jest/globals';
import type { PlatformConfig } from 'homebridge';
import {
  applyConfiguredDeviceOverrides,
  configuredDeviceFor,
  configuredDeviceName,
  configuredDevices,
  hasRequiredThinQConfig,
  isDeviceEnabled,
  isThinQ1Enabled,
  refreshIntervalMs,
} from './platformConfig.js';

const config = (value: Record<string, unknown>): PlatformConfig => ({
  platform: 'LGThinQ',
  ...value,
}) as unknown as PlatformConfig;

describe('platform config helpers', () => {
  test('normalizes configured device lists', () => {
    expect(configuredDevices(config({ devices: [{ id: 'a' }] }))).toEqual([{ id: 'a' }]);
    expect(configuredDevices(config({ devices: undefined }))).toEqual([]);
    expect(configuredDevices(config({ devices: 'not-array' }))).toEqual([]);
  });

  test('validates required ThinQ credentials', () => {
    expect(hasRequiredThinQConfig(config({
      country: 'US',
      language: 'en-US',
      refresh_token: 'token',
    }))).toBe(true);
    expect(hasRequiredThinQConfig(config({
      country: 'US',
      language: 'en-US',
      username: 'user',
      password: 'pass',
    }))).toBe(true);
    expect(hasRequiredThinQConfig(config({
      country: 'US',
      language: 'en-US',
    }))).toBe(false);
  });

  test('reads ThinQ1 enablement strictly as a boolean', () => {
    expect(isThinQ1Enabled(config({ thinq1: true }))).toBe(true);
    expect(isThinQ1Enabled(config({ thinq1: 'true' }))).toBe(false);
    expect(isThinQ1Enabled(config({}))).toBe(false);
  });

  test('normalizes refresh intervals to milliseconds', () => {
    expect(refreshIntervalMs(config({ refresh_interval: 10 }))).toBe(10000);
    expect(refreshIntervalMs(config({ refresh_interval: '15' }))).toBe(15000);
    expect(refreshIntervalMs(config({ refresh_interval: 0 }))).toBe(5000);
    expect(refreshIntervalMs(config({ refresh_interval: 'bad' }))).toBe(5000);
  });

  test('filters devices when configured ids are present', () => {
    expect(isDeviceEnabled(config({ devices: [] }), { id: 'a' } as any)).toBe(true);
    expect(isDeviceEnabled(config({ devices: [{ id: 'a' }] }), { id: 'a' } as any)).toBe(true);
    expect(isDeviceEnabled(config({ devices: [{ id: 'a' }] }), { id: 'b' } as any)).toBe(false);
  });

  test('finds configured device entries by discovered id', () => {
    const value = config({ devices: [{ id: 'a', name: 'Configured A' }] });

    expect(configuredDeviceFor(value, { id: 'a' } as any)).toEqual({ id: 'a', name: 'Configured A' });
    expect(configuredDeviceFor(value, { id: 'b' } as any)).toBeUndefined();
  });

  test('normalizes configured device names', () => {
    expect(configuredDeviceName(config({ devices: [{ id: 'a', name: ' Laundry ' }] }), { id: 'a' } as any))
      .toBe('Laundry');
    expect(configuredDeviceName(config({ devices: [{ id: 'a', name: '   ' }] }), { id: 'a' } as any))
      .toBeUndefined();
    expect(configuredDeviceName(config({ devices: [{ id: 'a', name: 123 }] }), { id: 'a' } as any))
      .toBeUndefined();
  });

  test('applies configured names to discovered devices', () => {
    const device = {
      id: 'a',
      data: {
        alias: 'LG Name',
      },
    } as any;

    expect(applyConfiguredDeviceOverrides(config({ devices: [{ id: 'a', name: 'Configured Name' }] }), device))
      .toBe(device);
    expect(device.data.alias).toBe('Configured Name');
  });
});
