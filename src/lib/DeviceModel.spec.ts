import { DeviceModel, RangeValue, ModelData } from './DeviceModel';
import { describe, test, beforeEach, expect } from '@jest/globals';

describe('DeviceModel', () => {
  let deviceModel: DeviceModel;

  const mockModelData: ModelData = {
    Info: {
      productType: 'Oven',
      productCode: 'OV123',
      country: 'US',
      modelType: 'SmartOven',
      model: 'OV123-US',
      modelName: 'Smart Oven',
      networkType: 'WiFi',
      version: '1.0',
    },
    Value: {
      temperature: {
        type: 'range',
        option: {
          min: 100,
          max: 500,
          step: 10,
        },
      },
      mode: {
        type: 'enum',
        option: {
          bake: 'Bake',
          roast: 'Roast',
          broil: 'Broil',
        },
      },
      door: {
        type: 'enum',
        option: {
          open: 'Open',
          closed: 'Closed',
        },
      },
    },
    MonitoringValue: {
      door: {
        dataType: 'enum',
        valueMapping: {
          open: { index: '1', label: 'Open' },
          closed: { index: '0', label: 'Closed' },
        },
      },
    },
  };

  beforeEach(() => {
    deviceModel = new DeviceModel(mockModelData);
  });

  test('should retrieve monitoring values', () => {
    const monitoringValues = deviceModel.monitoringValue;
    expect(monitoringValues).toEqual(mockModelData.MonitoringValue);
  });

  test('should retrieve value definition for a given key', () => {
    const value = deviceModel.value('temperature') as RangeValue;
    expect({ max: value.max, min: value.min, step: value.step }).toEqual(mockModelData.Value.temperature.option);
  });

  test('should return null for undefined value key', () => {
    const value = deviceModel.value('undefinedKey');
    expect(value).toBeNull();
  });

  test('should retrieve default value for a given key', () => {
    const mockModelDataWithDefault = {
      ...mockModelData,
      Value: {
        ...mockModelData.Value,
        temperature: {
          ...mockModelData.Value.temperature,
          default: 350,
        },
      },
    };
    deviceModel = new DeviceModel(mockModelDataWithDefault);

    const defaultValue = deviceModel.default('temperature');
    expect(defaultValue).toBe(350);
  });

  test('should retrieve enum value for a given key and name', () => {
    const enumValue = deviceModel.enumValue('mode', 'Bake');
    expect(enumValue).toBe('bake');
  });

  test('should return null for invalid enum key or name', () => {
    const invalidEnumValue = deviceModel.enumValue('mode', 'Invalid');
    expect(invalidEnumValue).toBeUndefined();
  });

  test('should retrieve enum name for a given key and value', () => {
    const enumName = deviceModel.enumName('mode', 'bake');
    expect(enumName).toBe('Bake');
  });

  test('should return null for invalid enum key or value', () => {
    const invalidEnumName = deviceModel.enumName('mode', 'invalid');
    expect(invalidEnumName).toBeNull();
  });

  test('should retrieve monitoring value mapping for a given key', () => {
    const mapping = deviceModel.monitoringValueMapping('door');
    expect(mapping).toEqual(mockModelData.Value.door.option);
  });

  test('should return null for invalid monitoring value key', () => {
    const invalidMapping = deviceModel.monitoringValueMapping('invalidKey');
    expect(invalidMapping).toBeNull();
  });

  test('should lookup monitor value by key and name', () => {
    const label = deviceModel.lookupMonitorValue('door', 'open');
    expect(label).toBe('Open');
  });

  test('should return default value for invalid monitor value lookup', () => {
    const defaultValue = deviceModel.lookupMonitorValue('door', 'invalid', 'Default');
    expect(defaultValue).toBe('Default');
  });

  test('should lookup monitor name by key and label', () => {
    const name = deviceModel.lookupMonitorName('door', 'Open');
    expect(name).toBe('open');
  });

  test('should return null for invalid monitor name lookup', () => {
    const invalidName = deviceModel.lookupMonitorName('door', 'Invalid');
    expect(invalidName).toBeUndefined();
  });

  test('should decode monitoring data as JSON', () => {
    const rawData = '{"key":"value"}';
    const decodedData = deviceModel.decodeMonitor(rawData);
    expect(decodedData).toEqual({ key: 'value' });
  });

  test('should return raw data if JSON decoding fails', () => {
    const rawData = 'invalidJSON';
    const decodedData = deviceModel.decodeMonitor(rawData);
    expect(decodedData).toBe(rawData);
  });
});
