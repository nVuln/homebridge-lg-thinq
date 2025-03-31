import { Device, DeviceData } from './Device';
import { describe, test, beforeEach, expect } from '@jest/globals';


describe('Device', () => {
  let device: Device;

  const mockDeviceData: DeviceData = {
    deviceId: '12345',
    alias: 'Smart Fridge',
    deviceType: 101,
    modelName: 'FR123-US',
    modelJsonUri: 'https://example.com/model.json',
    manufacture: {
      macAddress: '00:1A:2B:3C:4D:5E',
      salesModel: 'FR123',
      serialNo: 'SN123456789',
      manufactureModel: 'FR123-M',
    },
    online: true,
    modemInfo: {
      appVersion: '1.0.0',
      modelName: 'FR123-MODEM',
    },
    snapshot: {
      online: true,
    },
    platformType: 'ThinQ2',
  };

  beforeEach(() => {
    device = new Device(mockDeviceData);
  });

  test('should retrieve device ID', () => {
    expect(device.id).toBe('12345');
  });

  test('should retrieve device name', () => {
    expect(device.name).toBe('Smart Fridge');
  });

  test('should retrieve device type', () => {
    expect(device.type).toBe('REFRIGERATOR');
  });

  test('should retrieve device model from modelName', () => {
    expect(device.model).toBe('FR123-US');
  });

  test('should retrieve device model from modemInfo.modelName', () => {
    const data = { ...mockDeviceData, modelName: undefined };
    device = new Device(data);
    expect(device.model).toBe('FR123-MODEM');
  });

  test('should retrieve device model from manufacture.manufactureModel', () => {
    const data = { ...mockDeviceData, modelName: undefined, modemInfo: undefined };
    device = new Device(data);
    expect(device.model).toBe('FR123-M');
  });

  test('should return empty string if model is not available', () => {
    const data = { ...mockDeviceData, modelName: undefined, modemInfo: undefined, manufacture: undefined };
    device = new Device(data);
    expect(device.model).toBe('');
  });

  test('should retrieve MAC address', () => {
    expect(device.macAddress).toBe('00:1A:2B:3C:4D:5E');
  });

  test('should retrieve sales model', () => {
    expect(device.salesModel).toBe('FR123');
  });

  test('should retrieve serial number', () => {
    expect(device.serialNumber).toBe('SN123456789');
  });

  test('should retrieve firmware version', () => {
    expect(device.firmwareVersion).toBe('1.0.0');
  });

  test('should retrieve snapshot when available', () => {
    expect(device.snapshot).toEqual({ online: true });
  });

  test('should set snapshot', () => {
    const newSnapshot = { online: false };
    device.snapshot = newSnapshot;
    expect(device.snapshot).toEqual(newSnapshot);
  });

  test('should retrieve platform type', () => {
    expect(device.platform).toBe('ThinQ2');
  });

  test('should retrieve online status from data.online', () => {
    expect(device.online).toBe(true);
  });

  test('should retrieve online status from snapshot.online', () => {
    const data = { ...mockDeviceData, online: undefined, snapshot: { online: true } };
    let device2 = new Device(data);
    expect(device2.online).toBe(true);
  });

  test('should return string representation of the device', () => {
    expect(device.toString()).toBe('12345: Smart Fridge (REFRIGERATOR FR123-US)');
  });
});
