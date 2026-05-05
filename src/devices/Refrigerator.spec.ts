import { describe, expect, test } from '@jest/globals';
import type { DeviceModel } from '../lib/DeviceModel.js';
import {
  RefrigeratorStatus,
  refrigeratorFeatureCommand,
  refrigeratorTemperatureCommand,
} from './Refrigerator.js';

const createDeviceModel = () => ({
  data: {
    Config: {
      visibleItems: [
        {
          Feature: 'waterFilter',
          ControlTitle: 'Water Filter',
        },
      ],
    },
  },
  lookupMonitorName: (key: string) => {
    const values: Record<string, string> = {
      expressMode: 'EXPRESS_ON',
      expressFridge: 'EXPRESS_FRIDGE_ON',
      ecoFriendly: 'ECO_ON',
    };

    return values[key] ?? null;
  },
  lookupMonitorValue2: (key: string, value: unknown, fallback: string) => {
    if (value === '0') {
      return fallback;
    }

    const values: Record<string, string> = {
      freezerTemp_C: '-18',
      fridgeTemp_C: '4',
      freezerTemp_F: '32',
      fridgeTemp_F: '41',
    };

    return values[key] ?? value ?? fallback;
  },
}) as unknown as DeviceModel;

describe('RefrigeratorStatus', () => {
  test('normalizes Celsius ThinQ snapshot values into HomeKit state', () => {
    const status = new RefrigeratorStatus({
      tempUnit: 'CELSIUS',
      freezerTemp: 'ignored-by-model',
      fridgeTemp: 'ignored-by-model',
      atLeastOneDoorOpen: 'CLOSE',
      expressMode: 'EXPRESS_ON',
      expressFridge: 'EXPRESS_FRIDGE_ON',
      ecoFriendly: 'ECO_ON',
      waterFilter1RemainP: '74',
    }, createDeviceModel());

    expect(status.freezerTemperature).toBe(-18);
    expect(status.fridgeTemperature).toBe(4);
    expect(status.isDoorClosed).toBe(true);
    expect(status.isExpressModeOn).toBe(true);
    expect(status.isExpressFridgeOn).toBe(true);
    expect(status.isEcoFriendlyOn).toBe(true);
    expect(status.waterFilterRemain).toBe(74);
    expect(status.hasFeature('waterFilter')).toBe(true);
  });

  test('converts Fahrenheit ThinQ temperatures to Celsius', () => {
    const status = new RefrigeratorStatus({
      tempUnit: 'FAHRENHEIT',
      freezerTemp: 'ignored-by-model',
      fridgeTemp: 'ignored-by-model',
    }, createDeviceModel());

    expect(status.freezerTemperature).toBe(0);
    expect(status.fridgeTemperature).toBe(5);
  });

  test('uses safe defaults when snapshot data is missing', () => {
    const status = new RefrigeratorStatus(undefined, createDeviceModel());

    expect(status.freezerTemperature).toBe(0);
    expect(status.fridgeTemperature).toBe(0);
    expect(status.isDoorClosed).toBe(false);
    expect(status.isExpressModeOn).toBe(false);
    expect(status.isExpressFridgeOn).toBe(false);
    expect(status.isEcoFriendlyOn).toBe(false);
    expect(status.waterFilterRemain).toBe(0);
  });

  test('parses legacy water filter month strings defensively', () => {
    const status = new RefrigeratorStatus({ waterFilter: '3_MONTH' }, createDeviceModel());
    const invalid = new RefrigeratorStatus({ waterFilter: 'UNKNOWN' }, createDeviceModel());

    expect(status.waterFilterRemain).toBe(75);
    expect(invalid.waterFilterRemain).toBe(0);
  });
});

describe('Refrigerator command helpers', () => {
  test('builds feature toggle commands with the current temperature unit', () => {
    expect(refrigeratorFeatureCommand('expressMode', true, 'ON_VALUE', 'OFF_VALUE', 'CELSIUS')).toEqual({
      dataKey: null,
      dataValue: null,
      dataSetList: {
        refState: {
          expressMode: 'ON_VALUE',
          tempUnit: 'CELSIUS',
        },
      },
      dataGetList: null,
    });

    expect(refrigeratorFeatureCommand('ecoFriendly', false, 'ON_VALUE', 'OFF_VALUE', 'FAHRENHEIT').dataSetList.refState).toEqual({
      ecoFriendly: 'OFF_VALUE',
      tempUnit: 'FAHRENHEIT',
    });
  });

  test('builds temperature commands as refState payloads', () => {
    expect(refrigeratorTemperatureCommand('freezerTemp', '-18', 'CELSIUS')).toEqual({
      dataKey: null,
      dataValue: null,
      dataSetList: {
        refState: {
          freezerTemp: -18,
          tempUnit: 'CELSIUS',
        },
      },
      dataGetList: null,
    });
  });

});
