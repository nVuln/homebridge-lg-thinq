import type { EventEmitter } from 'events';

export type DeviceUpdateListener = (snapshot: unknown) => void;
export type DeviceUpdateListenerMap = Record<string, DeviceUpdateListener>;

export function removeDeviceUpdateListener(
  events: EventEmitter,
  listeners: DeviceUpdateListenerMap,
  deviceId: string,
): boolean {
  const existing = listeners[deviceId];
  if (!existing) {
    return false;
  }

  events.off(deviceId, existing);
  delete listeners[deviceId];
  return true;
}

export function bindDeviceUpdateListener(
  events: EventEmitter,
  listeners: DeviceUpdateListenerMap,
  deviceId: string,
  listener: DeviceUpdateListener,
): void {
  removeDeviceUpdateListener(events, listeners, deviceId);
  listeners[deviceId] = listener;
  events.on(deviceId, listener);
}
