import { DeviceModel, RangeValue, ModelData } from './DeviceModel.js';
import { describe, test, beforeEach, expect } from '@jest/globals';
import mockModelDataJson from '../../sample/airconditioner-model.json';

describe('DeviceModel', () => {
  let deviceModel: DeviceModel;
  const mockModelData: ModelData = mockModelDataJson as unknown as ModelData;
  beforeEach(() => {
    deviceModel = new DeviceModel(mockModelData as unknown as ModelData);
  });

  test('should retrieve monitoring values', () => {
    const monitoringValues = deviceModel.monitoringValue;
    expect(monitoringValues).toEqual(mockModelData.MonitoringValue);
  });

  test('should retrieve value definition for a given key', () => {
    const value = deviceModel.value('temperature') as RangeValue;
    expect(value).toBeDefined();
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
    deviceModel = new DeviceModel(mockModelDataWithDefault as unknown as ModelData);

    const defaultValue = deviceModel.default('temperature');
    expect(defaultValue).toBe(350);
  });

  test('should retrieve enum value for a given key and name', () => {
    const enumValue = deviceModel.enumValue('mode', 'Bake');
    expect(enumValue).toBeDefined();
  });

  test('should return null for invalid enum key or name', () => {
    const invalidEnumValue = deviceModel.enumValue('mode', 'Invalid');
    expect(invalidEnumValue).toBeNull();
  });

  test('should retrieve enum name for a given key and value', () => {
    const enumName = deviceModel.enumName('mode', 'bake');
    expect(enumName).toBeDefined();
  });

  test('should return null for invalid enum key or value', () => {
    const invalidEnumName = deviceModel.enumName('mode', 'invalid');
    expect(invalidEnumName).toBeNull();
  });

  test('should retrieve monitoring value mapping for a given key', () => {
    const mapping = deviceModel.monitoringValueMapping('door');
    expect(mapping).toBeDefined();
  });

  test('should return null for invalid monitoring value key', () => {
    const invalidMapping = deviceModel.monitoringValueMapping('invalidKey');
    expect(invalidMapping).toBeNull();
  });

  test('should lookup monitor value by key and name', () => {
    const label = deviceModel.lookupMonitorValue('door', 'open');
    expect(label).toBeDefined();
  });

  test('should return default value for invalid monitor value lookup', () => {
    const defaultValue = deviceModel.lookupMonitorValue2('door', 'invalid', 'Default');
    expect(defaultValue).toBe('Default');
  });

  test('should lookup monitor name by key and label', () => {
    const name = deviceModel.lookupMonitorName('door', 'Open');
    expect(name).toBeDefined();
  });

  test('should return null for invalid monitor name lookup', () => {
    const invalidName = deviceModel.lookupMonitorName('door', 'Invalid');
    expect(invalidName).toBeNull();
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
