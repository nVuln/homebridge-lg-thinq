import { describe, expect, test } from '@jest/globals';
import { readStylerState, type StylerModelLookup } from './Styler.js';

const modelWithRemoteStart = (enabledValue = 'REMOTE_START_ON'): StylerModelLookup => ({
  lookupMonitorName(key: string, label: string) {
    return key === 'remoteStart' && label === '@CP_ON_EN_W' ? enabledValue : null;
  },
});

describe('readStylerState', () => {
  test('normalizes running ThinQ styler state into HomeKit state', () => {
    const status = readStylerState({
      state: 'RUNNING',
      remoteStart: 'REMOTE_START_ON',
      remainTimeHour: '1',
      remainTimeMinute: 30,
    }, modelWithRemoteStart());

    expect(status).toEqual({
      isPowerOn: true,
      isRemoteStartOn: true,
      isRunning: true,
      isError: false,
      remainDuration: 5400,
    });
  });

  test('uses safe defaults when snapshot data is missing', () => {
    const status = readStylerState(undefined, modelWithRemoteStart());

    expect(status).toEqual({
      isPowerOn: false,
      isRemoteStartOn: false,
      isRunning: false,
      isError: false,
      remainDuration: 0,
    });
  });

  test('does not expose remaining duration while paused or complete', () => {
    const paused = readStylerState({
      state: 'PAUSE',
      remainTimeHour: 2,
      remainTimeMinute: 15,
    }, modelWithRemoteStart());

    const complete = readStylerState({
      state: 'COMPLETE',
      remainTimeHour: 1,
      remainTimeMinute: 10,
    }, modelWithRemoteStart());

    expect(paused.isPowerOn).toBe(true);
    expect(paused.isRunning).toBe(false);
    expect(paused.remainDuration).toBe(0);
    expect(complete.isRunning).toBe(false);
    expect(complete.remainDuration).toBe(0);
  });

  test('reports error state as powered but faulted and not running', () => {
    const status = readStylerState({
      state: 'ERROR',
      remainTimeHour: 3,
      remainTimeMinute: 5,
    }, modelWithRemoteStart());

    expect(status.isPowerOn).toBe(true);
    expect(status.isRunning).toBe(false);
    expect(status.isError).toBe(true);
    expect(status.remainDuration).toBe(0);
  });

  test('uses the model lookup value for remote start', () => {
    const status = readStylerState({
      state: 'RUNNING',
      remoteStart: '1',
    }, modelWithRemoteStart('1'));

    expect(status.isRemoteStartOn).toBe(true);
  });
});
