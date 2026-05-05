import { describe, expect, test } from '@jest/globals';
import type { DeviceModel } from '../lib/DeviceModel.js';
import { DishwasherStatus, readDishwasherState } from './Dishwasher.js';

const deviceModel = {
  lookupMonitorName: (key: string) => {
    if (key === 'state') {
      return 'RUNNING';
    }

    if (key === 'door') {
      return 'CLOSE';
    }

    return null;
  },
} as unknown as DeviceModel;

describe('DishwasherStatus', () => {
  test('normalizes ThinQ snapshot values into HomeKit state', () => {
    const status = new DishwasherStatus({
      state: 'RUNNING',
      door: 'CLOSE',
      remainTimeHour: '1',
      remainTimeMinute: 5,
      initialTimeHour: '2',
      initialTimeMinute: 15,
      rinseLevel: 'LEVEL_0',
      tclCount: '31',
    }, deviceModel);

    expect(status.isPowerOn).toBe(true);
    expect(status.isRunning).toBe(true);
    expect(status.isDoorClosed).toBe(true);
    expect(status.remainDuration).toBe(3900);
    expect(status.initialDuration).toBe(8100);
    expect(status.data.rinseLevel).toBe('LEVEL_0');
    expect(status.data.tclCount).toBe('31');
  });

  test('uses safe defaults when snapshot data is missing', () => {
    const status = new DishwasherStatus(undefined, deviceModel);

    expect(status.isPowerOn).toBe(false);
    expect(status.isRunning).toBe(false);
    expect(status.isDoorClosed).toBe(true);
    expect(status.remainDuration).toBe(0);
    expect(status.data.process).toBe('NONE');
    expect(status.data.extraDry).toBe('OFF');
  });

  test('exposes normalized state through the standalone reader', () => {
    const state = readDishwasherState({
      state: 'STAND',
      process: 'RESERVED',
      delayStart: 'ON',
      door: 'OPEN',
      initialTimeHour: 1,
      initialTimeMinute: '30',
      remainTimeHour: '3',
      remainTimeMinute: 45,
    }, deviceModel);

    expect(state.isPowerOn).toBe(true);
    expect(state.isRunning).toBe(false);
    expect(state.isDoorClosed).toBe(false);
    expect(state.isStandby).toBe(true);
    expect(state.isDelayReserved).toBe(true);
    expect(state.initialDuration).toBe(5400);
    expect(state.remainDuration).toBe(13500);
  });

  test('falls back to conventional dishwasher states when model mappings are absent', () => {
    const unmappedModel = {
      lookupMonitorName: () => null,
    } as unknown as DeviceModel;

    const status = new DishwasherStatus({
      state: 'RUNNING',
      door: 'CLOSE',
    }, unmappedModel);

    expect(status.isRunning).toBe(true);
    expect(status.isDoorClosed).toBe(true);
  });
});
