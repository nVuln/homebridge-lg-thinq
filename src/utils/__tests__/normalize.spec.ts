import { describe, it, expect } from '@jest/globals';
import {
  normalizeBoolean,
  normalizeNumber,
  safeParseInt,
  safeParseFloat,
  toSeconds,
} from '../normalize.js';

describe('normalize utilities', () => {
  describe('normalizeBoolean', () => {
    it('should return boolean values as-is', () => {
      expect(normalizeBoolean(true)).toBe(true);
      expect(normalizeBoolean(false)).toBe(false);
    });

    it('should convert number 1 to true and other numbers to false', () => {
      expect(normalizeBoolean(1)).toBe(true);
      expect(normalizeBoolean(0)).toBe(false);
      expect(normalizeBoolean(2)).toBe(false);
    });

    it('should convert string values correctly', () => {
      expect(normalizeBoolean('1')).toBe(true);
      expect(normalizeBoolean('true')).toBe(true);
      expect(normalizeBoolean('TRUE')).toBe(true);
      expect(normalizeBoolean('on')).toBe(true);
      expect(normalizeBoolean('ON')).toBe(true);
      expect(normalizeBoolean('0')).toBe(false);
      expect(normalizeBoolean('false')).toBe(false);
      expect(normalizeBoolean('off')).toBe(false);
    });

    it('should convert other truthy/falsy values', () => {
      expect(normalizeBoolean(null)).toBe(false);
      expect(normalizeBoolean(undefined)).toBe(false);
      expect(normalizeBoolean({})).toBe(true);
      expect(normalizeBoolean([])).toBe(true);
    });
  });

  describe('normalizeNumber', () => {
    it('should return null for null/undefined', () => {
      expect(normalizeNumber(null)).toBe(null);
      expect(normalizeNumber(undefined)).toBe(null);
    });

    it('should return number values as-is', () => {
      expect(normalizeNumber(42)).toBe(42);
      expect(normalizeNumber(3.14)).toBe(3.14);
      expect(normalizeNumber(0)).toBe(0);
    });

    it('should convert string to number', () => {
      expect(normalizeNumber('42')).toBe(42);
      expect(normalizeNumber('3.14')).toBe(3.14);
    });

    it('should return null for invalid strings', () => {
      expect(normalizeNumber('abc')).toBe(null);
    });

    it('should convert empty string to 0', () => {
      // Note: Number('') returns 0 in JavaScript
      expect(normalizeNumber('')).toBe(0);
    });
  });

  describe('safeParseInt', () => {
    it('should parse valid integers', () => {
      expect(safeParseInt('42')).toBe(42);
      expect(safeParseInt('0')).toBe(0);
      expect(safeParseInt('-10')).toBe(-10);
    });

    it('should return fallback for invalid values', () => {
      expect(safeParseInt('abc')).toBe(0);
      expect(safeParseInt('abc', 99)).toBe(99);
      expect(safeParseInt(null)).toBe(0);
      expect(safeParseInt(undefined, 5)).toBe(5);
    });
  });

  describe('safeParseFloat', () => {
    it('should parse valid floats', () => {
      expect(safeParseFloat('3.14')).toBe(3.14);
      expect(safeParseFloat('0.5')).toBe(0.5);
      expect(safeParseFloat('-2.5')).toBe(-2.5);
    });

    it('should return fallback for invalid values', () => {
      expect(safeParseFloat('abc')).toBe(0);
      expect(safeParseFloat('abc', 1.5)).toBe(1.5);
      expect(safeParseFloat(null)).toBe(0);
    });
  });

  describe('toSeconds', () => {
    it('should convert hours and minutes to seconds', () => {
      expect(toSeconds(1, 0)).toBe(3600);
      expect(toSeconds(0, 1)).toBe(60);
      expect(toSeconds(1, 30)).toBe(5400);
      expect(toSeconds(2, 15)).toBe(8100);
    });

    it('should handle optional seconds parameter', () => {
      expect(toSeconds(0, 0, 30)).toBe(30);
      expect(toSeconds(1, 1, 1)).toBe(3661);
    });

    it('should handle zero values', () => {
      expect(toSeconds(0, 0)).toBe(0);
      expect(toSeconds(0, 0, 0)).toBe(0);
    });
  });
});
