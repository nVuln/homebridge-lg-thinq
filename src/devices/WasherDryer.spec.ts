import { describe, expect, test } from '@jest/globals';
import type { DeviceModel } from '../lib/DeviceModel.js';
import { WasherDryerStatus, readWasherDryerState } from './WasherDryer.js';

const deviceModel = {
  lookupMonitorName: (key: string) => {
    if (key === 'remoteStart') {
      return 'REMOTE_ON';
    }

    if (key === 'doorLock') {
      return 'LOCKED';
    }

    return null;
  },
} as unknown as DeviceModel;

describe('readWasherDryerState', () => {
  test('normalizes ThinQ snapshot values into HomeKit state', () => {
    const status = readWasherDryerState({
      state: 'RUNNING',
      remoteStart: 'REMOTE_ON',
      doorLock: 'LOCKED',
      remainTimeHour: '1',
      remainTimeMinute: 15,
      TCLCount: '40',
    }, deviceModel);

    expect(status.isPowerOn).toBe(true);
    expect(status.isRunning).toBe(true);
    expect(status.isError).toBe(false);
    expect(status.isRemoteStartEnable).toBe(true);
    expect(status.isDoorLocked).toBe(true);
    expect(status.remainDuration).toBe(4500);
    expect(status.TCLCount).toBe(30);
  });

  test('uses safe defaults when snapshot data is missing', () => {
    const status = readWasherDryerState(undefined, deviceModel);

    expect(status.isPowerOn).toBe(false);
    expect(status.isRunning).toBe(false);
    expect(status.isError).toBe(false);
    expect(status.isRemoteStartEnable).toBe(false);
    expect(status.isDoorLocked).toBe(false);
    expect(status.remainDuration).toBe(0);
    expect(status.TCLCount).toBe(0);
  });

  test('falls back to legacy door-lock values when the model does not map the monitor name', () => {
    const legacyModel = {
      lookupMonitorName: () => null,
    } as unknown as DeviceModel;

    const status = readWasherDryerState({ doorLock: 'DOORLOCK_ON' }, legacyModel);

    expect(status.isDoorLocked).toBe(true);
  });

  test('exposes the same state through the compatibility status wrapper', () => {
    const status = new WasherDryerStatus({
      state: 'RUNNING',
      remoteStart: 'REMOTE_ON',
      doorLock: 'LOCKED',
      remainTimeHour: 2,
      remainTimeMinute: '5',
      TCLCount: 12,
    }, deviceModel);

    expect(status.isPowerOn).toBe(true);
    expect(status.isRunning).toBe(true);
    expect(status.isError).toBe(false);
    expect(status.isRemoteStartEnable).toBe(true);
    expect(status.isDoorLocked).toBe(true);
    expect(status.remainDuration).toBe(7500);
    expect(status.TCLCount).toBe(12);
  });
});
