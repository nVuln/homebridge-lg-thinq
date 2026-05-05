import type { Service } from 'homebridge';
import { describe, expect, test, jest } from '@jest/globals';
import {
  contactSensorStateValue,
  hasSnapshotKey,
  snapshotBoolean,
  snapshotNumber,
  snapshotString,
  updateCharacteristicIfChanged,
  updateCharacteristicIfDefined,
  visibilityCharacteristicUpdate,
} from './helpers.js';

const createService = (initialValues: Record<string, unknown> = {}) => {
  const values = new Map(Object.entries(initialValues));
  const service = {
    getCharacteristic: jest.fn((characteristic: string) => ({
      value: values.get(characteristic),
    })),
    updateCharacteristic: jest.fn((characteristic: string, value: unknown) => {
      values.set(characteristic, value);
      return service;
    }),
  };

  return service;
};

describe('device helpers', () => {
  test('checks snapshot keys safely', () => {
    expect(hasSnapshotKey({ value: undefined }, 'value')).toBe(true);
    expect(hasSnapshotKey({}, 'value')).toBe(false);
    expect(hasSnapshotKey(undefined, 'value')).toBe(false);
  });

  test('updates a characteristic only when the value changed', () => {
    const service = createService({ Active: 1 });

    expect(updateCharacteristicIfChanged(service as unknown as Service, 'Active', 1)).toBe(false);
    expect(service.updateCharacteristic).not.toHaveBeenCalled();

    expect(updateCharacteristicIfChanged(service as unknown as Service, 'Active', 0)).toBe(true);
    expect(service.updateCharacteristic).toHaveBeenCalledWith('Active', 0);
  });

  test('maps boolean contact state to HomeKit contact sensor values', () => {
    const contactState = {
      CONTACT_DETECTED: 1,
      CONTACT_NOT_DETECTED: 0,
    };

    expect(contactSensorStateValue(true, contactState)).toBe(1);
    expect(contactSensorStateValue(false, contactState)).toBe(0);
  });

  test('maps boolean visibility to HomeKit target and current visibility values', () => {
    const visibilityState = {
      SHOWN: 0,
      HIDDEN: 1,
    };

    expect(visibilityCharacteristicUpdate(true, visibilityState, visibilityState)).toEqual({
      targetVisibilityState: 0,
      currentVisibilityState: 0,
    });
    expect(visibilityCharacteristicUpdate(false, visibilityState, visibilityState)).toEqual({
      targetVisibilityState: 1,
      currentVisibilityState: 1,
    });
  });

  test('does not update a missing service', () => {
    expect(updateCharacteristicIfChanged(undefined, 'Active', 1)).toBe(false);
  });

  test('skips undefined optional values but allows null values', () => {
    const service = createService({ RemainingDuration: 12 });

    expect(updateCharacteristicIfDefined(service as unknown as Service, 'RemainingDuration', undefined)).toBe(false);
    expect(service.updateCharacteristic).not.toHaveBeenCalled();

    expect(updateCharacteristicIfDefined(service as unknown as Service, 'RemainingDuration', null)).toBe(true);
    expect(service.updateCharacteristic).toHaveBeenCalledWith('RemainingDuration', null);
  });

  test('normalizes numeric snapshot values', () => {
    expect(snapshotNumber({ value: 12 }, 'value')).toBe(12);
    expect(snapshotNumber({ value: '12' }, 'value')).toBe(12);
    expect(snapshotNumber({ value: 'not-a-number' }, 'value', 3)).toBe(3);
    expect(snapshotNumber(null, 'value', 3)).toBe(3);
  });

  test('normalizes string snapshot values', () => {
    expect(snapshotString({ value: 'ON' }, 'value')).toBe('ON');
    expect(snapshotString({ value: 1 }, 'value', 'OFF')).toBe('OFF');
    expect(snapshotString(undefined, 'value', 'OFF')).toBe('OFF');
  });

  test('normalizes boolean snapshot values', () => {
    expect(snapshotBoolean({ value: true }, 'value')).toBe(true);
    expect(snapshotBoolean({ value: 1 }, 'value')).toBe(true);
    expect(snapshotBoolean({ value: 'ENA' }, 'value')).toBe(true);
    expect(snapshotBoolean({ value: 'DIS' }, 'value')).toBe(false);
    expect(snapshotBoolean(null, 'value', true)).toBe(true);
  });
});
