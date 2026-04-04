import { Helper, fToC, cToF } from './helper.js';
import { Device } from './lib/Device.js';
import { Categories } from 'homebridge';
import { describe, expect, it, jest } from '@jest/globals';

jest.mock('./lib/Device');

describe('Helper', () => {
  describe('make', () => {
    it('should return AirConditioner class for AC device type', () => {
      const mockDevice = { type: 'AC' } as Device;
      const result = Helper.make(mockDevice);
      expect(result).toBeDefined();
    });

    it('should return null for unknown device types', () => {
      const mockDevice = { type: 'UNKNOWN' } as Device;
      const result = Helper.make(mockDevice);
      expect(result).toBeNull();
    });
  });

  describe('category', () => {
    it('should return Categories.AIR_CONDITIONER for AC device type', () => {
      const mockDevice = { type: 'AC' } as Device;
      const result = Helper.category(mockDevice);
      expect(result).toBe(Categories.AIR_CONDITIONER);
    });

    it('should return Categories.OTHER for unknown device types', () => {
      const mockDevice = { type: 'UNKNOWN' } as Device;
      const result = Helper.category(mockDevice);
      expect(result).toBe(Categories.OTHER);
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
