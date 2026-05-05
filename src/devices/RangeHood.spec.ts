import { describe, expect, test } from '@jest/globals';
import { readRangeHoodState, type RangeHoodModelLookup } from './RangeHood.js';

const modelWithEnabledValues = (
  enabledValues: Record<string, string | null> = {
    VentSet: 'ENABLE',
    LampSet: 'ENABLE',
  },
): RangeHoodModelLookup => ({
  lookupMonitorName(key: string) {
    return enabledValues[key] ?? null;
  },
});

describe('readRangeHoodState', () => {
  test('normalizes ThinQ hood state values into HomeKit state', () => {
    const status = readRangeHoodState({
      hoodState: {
        ventSet: 'ENABLE',
        ventLevel: '3',
        lampSet: 'ENABLE',
        lampLevel: 2,
      },
    }, modelWithEnabledValues());

    expect(status).toEqual({
      isVentOn: true,
      ventLevel: 3,
      isLampOn: true,
      lampLevel: 2,
    });
  });

  test('uses safe defaults when snapshot data is missing', () => {
    const status = readRangeHoodState(undefined, modelWithEnabledValues());

    expect(status).toEqual({
      isVentOn: false,
      ventLevel: 0,
      isLampOn: false,
      lampLevel: 0,
    });
  });

  test('uses model lookup values instead of hard-coded enabled names', () => {
    const status = readRangeHoodState({
      hoodState: {
        ventSet: '1',
        ventLevel: 1,
        lampSet: 'Y',
        lampLevel: '1',
      },
    }, modelWithEnabledValues({
      VentSet: '1',
      LampSet: 'Y',
    }));

    expect(status.isVentOn).toBe(true);
    expect(status.isLampOn).toBe(true);
    expect(status.ventLevel).toBe(1);
    expect(status.lampLevel).toBe(1);
  });
});
