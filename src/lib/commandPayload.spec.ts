import { describe, expect, jest, test } from '@jest/globals';
import type { DeviceModel } from './DeviceModel.js';
import { ValueType } from './DeviceModel.js';
import {
  coerceCommandPayload,
  coerceDataSetList,
  coerceModelValue,
  normalizeBooleanValues,
} from './commandPayload.js';

function fakeModel(types: Record<string, ValueType>, enumValues: Record<string, string> = {}): DeviceModel {
  return {
    value: jest.fn((key: string) => key in types ? { type: types[key] } : null),
    enumValue: jest.fn((key: string, value: string) => enumValues[`${key}:${value}`] ?? null),
  } as unknown as DeviceModel;
}

describe('command payload coercion', () => {
  test('coerces individual model values by LG value type', () => {
    const model = fakeModel({
      power: ValueType.Bit,
      temp: ValueType.Range,
      mode: ValueType.Enum,
    }, {
      'mode:Cool': '1',
    });

    expect(coerceModelValue(model, 'power', true)).toBe(1);
    expect(coerceModelValue(model, 'power', 'false')).toBe(0);
    expect(coerceModelValue(model, 'temp', '23')).toBe(23);
    expect(coerceModelValue(model, 'temp', 'warm')).toBe('warm');
    expect(coerceModelValue(model, 'mode', 'Cool')).toBe('1');
    expect(coerceModelValue(model, 'mode', 'Dry')).toBe('Dry');
    expect(coerceModelValue(undefined, 'power', true)).toBe(true);
  });

  test('coerces flat dataKey/dataValue payloads and normalizes booleans', () => {
    const model = fakeModel({
      power: ValueType.Bit,
    });
    const payload = {
      dataKey: 'power',
      dataValue: true,
      nested: {
        extraFlag: false,
      },
    };

    coerceCommandPayload(payload, model);

    expect(payload.dataValue).toBe(1);
    expect(payload.nested.extraFlag).toBe(0);
  });

  test('coerces flat dataSetList values', () => {
    const model = fakeModel({
      temp: ValueType.Range,
      mode: ValueType.Enum,
    }, {
      'mode:Cool': '1',
    });
    const dataSetList = {
      temp: '23',
      mode: 'Cool',
    };

    coerceDataSetList(dataSetList, model);

    expect(dataSetList).toEqual({
      temp: 23,
      mode: '1',
    });
  });

  test('coerces nested dataSetList payloads without flattening command shape', () => {
    const model = fakeModel({
      setTargetTemp: ValueType.Range,
      cmdOptionSetCookName: ValueType.Enum,
      cmdOptionSetRapidPreheat: ValueType.Bit,
    }, {
      'cmdOptionSetCookName:Bake': 'BAKE',
    });
    const payload = {
      dataSetList: {
        ovenState: {
          setTargetTemp: '350',
          cmdOptionSetCookName: 'Bake',
          cmdOptionSetRapidPreheat: true,
        },
      },
    };

    coerceCommandPayload(payload, model);

    expect(payload.dataSetList.ovenState).toEqual({
      setTargetTemp: 350,
      cmdOptionSetCookName: 'BAKE',
      cmdOptionSetRapidPreheat: 1,
    });
  });

  test('normalizes nested boolean values without a model', () => {
    const payload = {
      dataSetList: {
        outer: {
          enabled: true,
        },
      },
    };

    normalizeBooleanValues(payload);

    expect(payload.dataSetList.outer.enabled).toBe(1);
  });
});
