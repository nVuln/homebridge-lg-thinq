import type { API, Logging, PlatformAccessory } from 'homebridge';
import type { EventEmitter } from 'events';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';
import type { AccessoryContext, BaseDevice } from './baseDevice.js';
import type { Device } from './lib/Device.js';
import type { LGThinQHomebridgePlatform } from './platform.js';
import { DeviceUpdateListenerMap, removeDeviceUpdateListener } from './platformEvents.js';

export type DeviceAccessoryConstructor = new (
  platform: LGThinQHomebridgePlatform,
  accessory: PlatformAccessory<AccessoryContext>,
  log: Logging,
) => BaseDevice;

export function pendingAccessoryIds(accessories: PlatformAccessory<AccessoryContext>[]): Set<string> {
  return new Set(accessories.map(accessory => accessory.UUID));
}

export function markAccessorySeen(pendingIds: Set<string>, deviceId: string): void {
  pendingIds.delete(deviceId);
}

export function findAccessoryForDevice(
  accessories: PlatformAccessory<AccessoryContext>[],
  device: Pick<Device, 'id'>,
): PlatformAccessory<AccessoryContext> | undefined {
  return accessories.find(accessory => accessory.UUID === device.id);
}

export function updateAccessoryDisplayName(options: {
  api: API;
  log: Logging;
  accessory: PlatformAccessory<AccessoryContext>;
  name: string;
}): boolean {
  const { api, log, accessory, name } = options;

  if (accessory.displayName === name) {
    return false;
  }

  log.info('Updating accessory name:', accessory.displayName, '->', name);
  accessory.updateDisplayName(name);
  api.updatePlatformAccessories([accessory]);
  return true;
}

export function createOrRestoreDeviceAccessory(options: {
  platform: LGThinQHomebridgePlatform;
  api: API;
  log: Logging;
  accessories: PlatformAccessory<AccessoryContext>[];
  pendingIds: Set<string>;
  device: Device;
  accessoryType: DeviceAccessoryConstructor;
  category: number;
}): BaseDevice {
  const {
    platform,
    api,
    log,
    accessories,
    pendingIds,
    device,
    accessoryType,
    category,
  } = options;
  const existingAccessory = findAccessoryForDevice(accessories, device);

  if (existingAccessory) {
    markAccessorySeen(pendingIds, device.id);
    log.info('Restoring existing accessory:', device.toString());
    existingAccessory.context.device = device;
    updateAccessoryDisplayName({
      api,
      log,
      accessory: existingAccessory,
      name: device.name,
    });
    return new accessoryType(platform, existingAccessory, log);
  }

  log.info('Adding new accessory:', device.toString());

  const accessory = new api.platformAccessory(device.name, device.id, category) as PlatformAccessory<AccessoryContext>;
  accessory.context.device = device;

  const deviceHandler = new accessoryType(platform, accessory, log);
  api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
  accessories.push(accessory);

  return deviceHandler;
}

export function staleAccessories(
  accessories: PlatformAccessory<AccessoryContext>[],
  pendingIds: Set<string>,
): PlatformAccessory<AccessoryContext>[] {
  return accessories.filter(accessory => pendingIds.has(accessory.UUID));
}

export function removeStaleAccessories(options: {
  api: API;
  log: Logging;
  accessories: PlatformAccessory<AccessoryContext>[];
  events: EventEmitter;
  listeners: DeviceUpdateListenerMap;
  pendingIds: Set<string>;
}): PlatformAccessory<AccessoryContext>[] {
  const {
    api,
    log,
    accessories,
    events,
    listeners,
    pendingIds,
  } = options;
  const accessoriesToRemove = staleAccessories(accessories, pendingIds);

  if (!accessoriesToRemove.length) {
    return [];
  }

  for (const accessory of accessoriesToRemove) {
    log.info('Removing accessory:', accessory.displayName);
    removeDeviceUpdateListener(events, listeners, accessory.UUID);

    const accessoryIndex = accessories.indexOf(accessory);
    if (accessoryIndex >= 0) {
      accessories.splice(accessoryIndex, 1);
    }
  }

  api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, accessoriesToRemove);
  return accessoriesToRemove;
}
