import { BaseDevice, AccessoryContext, isDeviceOnlineForHomeKit } from './baseDevice.js';
import { LGThinQHomebridgePlatform } from './platform.js';
import { CharacteristicGetCallback, Logger, PlatformAccessory } from 'homebridge';
import { Device, DeviceData } from './lib/Device.js';
import { describe, expect, it, jest, beforeEach } from '@jest/globals';

// Mock dependencies
jest.mock('./platform.js');
jest.mock('./lib/Device');

class TestBaseDevice extends BaseDevice {
  public testOnlineGet<T extends number | string | boolean>(getter: () => T) {
    return this.onlineGet(getter);
  }

  public testOnlineGetCallback<T extends number | string | boolean>(getter: () => T) {
    return this.onlineGetCallback(getter);
  }
}

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
        AccessoryInformation: function AccessoryInformation() {},
      },
      Characteristic: {
        Manufacturer: 'Manufacturer',
        Model: 'Model',
        SerialNumber: 'SerialNumber',
      },
      api: {
        hap: {
          HAPStatus: {
            SERVICE_COMMUNICATION_FAILURE: -70402,
          },
          HapStatusError: class HapStatusError extends Error {
            constructor(public status: number) {
              super(String(status));
            }
          },
        },
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
    expect(accessory.addService).toHaveBeenCalled();
    const calledArg = (accessory.addService as jest.Mock).mock.calls[0][0] as any;
    if (typeof calledArg === 'function') {
      expect(calledArg.name).toBe('AccessoryInformation');
    } else {
      expect(calledArg.displayName).toBe('AccessoryInformation');
    }
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

  it('should treat only explicit offline devices as unavailable for HomeKit', () => {
    expect(isDeviceOnlineForHomeKit({ online: true } as Device)).toBe(true);
    expect(isDeviceOnlineForHomeKit({ online: undefined } as Device)).toBe(true);
    expect(isDeviceOnlineForHomeKit({ online: false } as Device)).toBe(false);
  });

  it('should guard onGet handlers when the device is offline', () => {
    baseDevice = new TestBaseDevice(platform, accessory, logger);
    expect((baseDevice as TestBaseDevice).testOnlineGet(() => 1)()).toBe(1);

    Object.defineProperty(accessory.context.device, 'online', { configurable: true, get: () => false });
    expect(() => (baseDevice as TestBaseDevice).testOnlineGet(() => 1)()).toThrow('-70402');
  });

  it('should guard callback get handlers when the device is offline', () => {
    baseDevice = new TestBaseDevice(platform, accessory, logger);
    Object.defineProperty(accessory.context.device, 'online', { configurable: true, get: () => false });

    const callback = jest.fn() as jest.MockedFunction<CharacteristicGetCallback>;
    (baseDevice as TestBaseDevice).testOnlineGetCallback(() => 1)(callback);

    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ message: '-70402' }));
  });

  it('should update top-level online status from explicit snapshot updates', () => {
    baseDevice = new BaseDevice(platform, accessory, logger);
    accessory.context.device.data = {
      online: true,
      snapshot: {
        online: true,
      },
    } as DeviceData;
    Object.defineProperty(accessory.context.device, 'snapshot', {
      configurable: true,
      get: () => accessory.context.device.data.snapshot,
    });

    baseDevice.update({ online: false });

    expect(accessory.context.device.data.online).toBe(false);
  });
});
