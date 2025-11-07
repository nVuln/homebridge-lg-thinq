import { BaseDevice, AccessoryContext } from './baseDevice.js';
import { LGThinQHomebridgePlatform } from './platform.js';
import { Logger, PlatformAccessory } from 'homebridge';
import { Device, DeviceData } from './lib/Device.js';
import { describe, expect, it, jest, beforeEach } from '@jest/globals';

// Mock dependencies
jest.mock('./platform.js');
jest.mock('./lib/Device');

// Test suite for BaseDevice class
describe('BaseDevice', () => {
  let platform: LGThinQHomebridgePlatform;
  let accessory: PlatformAccessory<AccessoryContext>;
  let logger: Logger;
  let device: Device;
  let baseDevice: BaseDevice;
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



    logger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as unknown as Logger;

    platform = {
      Service: {
        AccessoryInformation: jest.fn(),
      },
      Characteristic: {
        Manufacturer: 'Manufacturer',
        Model: 'Model',
        SerialNumber: 'SerialNumber',
      },
      config: {
        devices: [
          { id: '12345', customConfig: true },
        ],
      },
      log: logger,
    } as unknown as LGThinQHomebridgePlatform;

    accessory = {
      context: {
        device: new Device(mockDeviceData),
      },
      getService: jest.fn().mockReturnValue(null),
      addService: jest.fn().mockImplementation(() => ({
        setCharacteristic: jest.fn().mockReturnThis(),
      })),
    } as unknown as PlatformAccessory<AccessoryContext>;

    device = accessory.context.device;
  });

  it('should set accessory information on initialization', () => {
    baseDevice = new BaseDevice(platform, accessory, logger);
    expect(accessory.addService).toHaveBeenCalledWith(platform.Service.AccessoryInformation);
  });

  it('should update accessory characteristics', () => {
    baseDevice = new BaseDevice(platform, accessory, logger);
    const newDevice = { ...device, name: 'Updated Device' } as Device;
    baseDevice.updateAccessoryCharacteristic(newDevice);
    expect(accessory.context.device).toEqual(newDevice);
  });

  // it('should update device snapshot and accessory characteristics', () => {
  //   baseDevice = new BaseDevice(platform, accessory, logger);
  //   const snapshot = { key: 'value' };
  //   baseDevice.update(snapshot);
  //   expect(device.data.snapshot).toEqual({ key: 'value' });
  //   expect(accessory.context.device).toEqual(device);
  // });

  // it('should return the correct configuration for the device', () => {
  //   baseDevice = new BaseDevice(platform, accessory, logger);
  //   expect(baseDevice.config).toEqual({ id: '12345', customConfig: true });
  // });

  it('should return an empty object if no configuration is found for the device', () => {
    baseDevice = new BaseDevice(platform, accessory, logger);
    platform.config.devices = [];
    expect(baseDevice.config).toEqual({});
  });

  it('should return an empty string for the static model method', () => {
    expect(BaseDevice.model()).toBe('');
  });
});