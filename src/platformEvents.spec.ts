import { EventEmitter } from 'events';
import { describe, expect, jest, test } from '@jest/globals';
import {
  bindDeviceUpdateListener,
  DeviceUpdateListenerMap,
  removeDeviceUpdateListener,
} from './platformEvents.js';

describe('platform event helpers', () => {
  test('replaces existing device listeners instead of stacking them', () => {
    const events = new EventEmitter();
    const listeners: DeviceUpdateListenerMap = {};
    const first = jest.fn();
    const second = jest.fn();

    bindDeviceUpdateListener(events, listeners, 'device-1', first);
    bindDeviceUpdateListener(events, listeners, 'device-1', second);

    events.emit('device-1', { power: true });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    expect(events.listenerCount('device-1')).toBe(1);
  });

  test('removes registered listeners', () => {
    const events = new EventEmitter();
    const listeners: DeviceUpdateListenerMap = {};
    const listener = jest.fn();

    bindDeviceUpdateListener(events, listeners, 'device-1', listener);

    expect(removeDeviceUpdateListener(events, listeners, 'device-1')).toBe(true);
    expect(removeDeviceUpdateListener(events, listeners, 'missing')).toBe(false);

    events.emit('device-1', { power: true });

    expect(listener).not.toHaveBeenCalled();
    expect(events.listenerCount('device-1')).toBe(0);
  });
});
