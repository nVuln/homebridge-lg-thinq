import { Helper, fToC, cToF } from './helper';
import { Device } from './lib/Device';
import { Categories } from 'homebridge';
import { PlatformType } from './lib/constants';
import { describe, expect, it, jest } from '@jest/globals';

// Mock dependencies
jest.mock('./lib/Device');
jest.mock('./lib/constants', () => ({
  PlatformType: {
    ThinQ1: 'ThinQ1',
    ThinQ2: 'ThinQ2',
  },
}));

// Test suite for Helper class and utility functions
describe('Helper', () => {
  describe('make', () => {
    it('should return V1helper.make for ThinQ1 platform', () => {
      const mockDevice = { platform: PlatformType.ThinQ1 } as Device;
      const result = Helper.make(mockDevice);
      expect(result).toBeDefined();
    });

    it('should return the correct class for ThinQ2 devices', () => {
      const mockDevice = { platform: PlatformType.ThinQ2, type: 'AC' } as Device;
      const result = Helper.make(mockDevice);
      expect(result).toBeDefined();
    });

    it('should return null for unknown device types', () => {
      const mockDevice = { platform: PlatformType.ThinQ2, type: 'UNKNOWN' } as Device;
      const result = Helper.make(mockDevice);
      expect(result).toBeNull();
    });

    it('should return null for unsupported platform types', () => {
      const mockDevice = { platform: 'UnsupportedPlatform' } as Device;
      const result = Helper.make(mockDevice);
      expect(result).toBeNull();
    });
  });

  describe('category', () => {
    it('should return the correct category for known device types', () => {
      const mockDevice = { type: 'AIR_PURIFIER' } as Device;
      const result = Helper.category(mockDevice);
      expect(result).toBe(Categories.AIR_PURIFIER);
    });

    it('should return Categories.OTHER for unknown device types', () => {
      const mockDevice = { type: 'UNKNOWN' } as Device;
      const result = Helper.category(mockDevice);
      expect(result).toBe(Categories.OTHER);
    });

    it('should return Categories.AIR_CONDITIONER for AC device type', () => {
      const mockDevice = { type: 'AC' } as Device;
      const result = Helper.category(mockDevice);
      expect(result).toBe(Categories.AIR_CONDITIONER);
    });
  });
});

describe('Utility functions', () => {

  describe('fToC', () => {
    it('should convert Fahrenheit to Celsius', () => {
      expect(fToC(32)).toBe(0);
      expect(fToC(212)).toBe(100);
    });

    it('should handle negative Fahrenheit values', () => {
      expect(fToC(-40)).toBe(-40);
    });
  });

  describe('cToF', () => {
    it('should convert Celsius to Fahrenheit', () => {
      expect(cToF(0)).toBe(32);
      expect(cToF(100)).toBe(212);
    });

    it('should handle negative Celsius values', () => {
      expect(cToF(-40)).toBe(-40);
    });
  });
});