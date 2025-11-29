import { Device, DeviceData } from './Device.js';
import { describe, test, beforeEach, expect } from '@jest/globals';
import Fs from 'fs';
import Path from 'path';

const mockDeviceData = JSON.parse(Fs.readFileSync(Path.resolve(process.cwd(), 'sample/airconditioner.json'), 'utf8'));

describe('Device', () => {
  let device: Device;

  beforeEach(() => {
    device = new Device(mockDeviceData as unknown as DeviceData);
  });

  test('should retrieve device ID', () => {
    expect(device.id).toBe(mockDeviceData.deviceId);
  });

  test('should retrieve device name', () => {
    expect(device.name).toBe(mockDeviceData.alias);
  });

  test('should retrieve device type', () => {
    expect(device.type).toBe('AC');
  });

  test('should retrieve device model from modelName', () => {
    expect(device.model).toBe(mockDeviceData.modelName.slice(0, -3));
  });

  test('should retrieve MAC address', () => {
    expect(device.macAddress).toBe(mockDeviceData.manufacture.macAddress);
  });

  test('should retrieve sales model', () => {
    expect(device.salesModel).toBe(mockDeviceData.manufacture.salesModel);
  });

  test('should retrieve serial number', () => {
    expect(device.serialNumber).toBe(mockDeviceData.manufacture.serialNo);
  });

  test('should retrieve firmware version', () => {
    expect(device.firmwareVersion).toBe(mockDeviceData.modemInfo.appVersion);
  });

  test('should retrieve snapshot when available', () => {
    expect(device.snapshot).toEqual(mockDeviceData.snapshot);
  });

  test('should set snapshot', () => {
    const newSnapshot = { online: false };
    device.snapshot = newSnapshot;
    expect(device.snapshot).toEqual(newSnapshot);
  });

  test('should retrieve platform type', () => {
    expect(device.platform).toBe(mockDeviceData.platformType);
  });

  test('should retrieve online status from data.online', () => {
    expect(device.online).toBe(mockDeviceData.online);
  });

  test('should return string representation of the device', () => {
    expect(device.toString()).toBe(`${mockDeviceData.deviceId}: ${mockDeviceData.alias} (AC ${mockDeviceData.modelName.slice(0, -3)})`);
  });
});
