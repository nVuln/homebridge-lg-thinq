import type { PlatformConfig } from 'homebridge';
import type { Device } from './lib/Device.js';

type ConfiguredDevice = {
  id?: unknown;
  name?: unknown;
};

export function configuredDevices(config: PlatformConfig): ConfiguredDevice[] {
  return Array.isArray(config.devices) ? config.devices as ConfiguredDevice[] : [];
}

export function hasRequiredThinQConfig(config: PlatformConfig): boolean {
  const hasCredentials = Boolean(config.username && config.password);
  return Boolean(config.country && config.language && (hasCredentials || config.refresh_token));
}

export function isThinQ1Enabled(config: PlatformConfig): boolean {
  return config.thinq1 === true;
}

export function refreshIntervalMs(config: PlatformConfig): number {
  const seconds = Number(config.refresh_interval ?? 5);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 5000;
}

export function isDeviceEnabled(config: PlatformConfig, device: Pick<Device, 'id'>): boolean {
  const devices = configuredDevices(config);
  return devices.length === 0 || devices.some(enabled => enabled.id === device.id);
}

export function configuredDeviceFor(config: PlatformConfig, device: Pick<Device, 'id'>): ConfiguredDevice | undefined {
  return configuredDevices(config).find(enabled => enabled.id === device.id);
}

export function configuredDeviceName(config: PlatformConfig, device: Pick<Device, 'id'>): string | undefined {
  const name = configuredDeviceFor(config, device)?.name;

  if (typeof name !== 'string') {
    return undefined;
  }

  const trimmedName = name.trim();
  return trimmedName || undefined;
}

export function applyConfiguredDeviceOverrides<T extends Device>(config: PlatformConfig, device: T): T {
  const name = configuredDeviceName(config, device);

  if (name) {
    device.data.alias = name;
  }

  return device;
}
