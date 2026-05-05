import type { Logging, PlatformConfig } from 'homebridge';
import { Helper } from './helper.js';
import { NotConnectedError } from './errors/index.js';
import type { Device } from './lib/Device.js';
import { PlatformType } from './lib/constants.js';
import type { ThinQ } from './lib/ThinQ.js';
import type { DeviceAccessoryConstructor } from './platformAccessories.js';
import { isDeviceEnabled } from './platformConfig.js';

export const DISCOVERY_RETRY_DELAY_MS = 30000;

export type DeviceAccessoryResolver = {
  make(device: Device): DeviceAccessoryConstructor | null;
  category(device: Device): number;
};

export type DiscoveryThinQ = Pick<ThinQ, 'setup' | 'unregister'>;

export type PreparedDevice =
  | {
    status: 'ready';
    accessoryType: DeviceAccessoryConstructor;
    category: number;
  }
  | {
    status: 'skipped';
    reason: 'thinq1-disabled' | 'config-disabled' | 'setup-failed' | 'unsupported';
  };

const defaultDeviceAccessoryResolver: DeviceAccessoryResolver = {
  make: device => Helper.make(device) as DeviceAccessoryConstructor | null,
  category: device => Helper.category(device),
};

export function isRetryableDiscoveryError(err: unknown): boolean {
  return err instanceof NotConnectedError;
}

export function unregisterUnsupportedDevice(options: {
  log: Logging;
  thinq: DiscoveryThinQ;
  device: Device;
}): void {
  const { log, thinq, device } = options;

  log.info('Device not supported: ' + device.platform + ': ' + device.toString());
  thinq.unregister(device).then(() => {
    log.debug(device.id, '- unregistered!');
  }).catch(err => {
    log.debug(device.id, '- unregister failed:', err);
  });
}

export async function prepareDiscoveredDevice(options: {
  log: Logging;
  config: PlatformConfig;
  enableThinQ1: boolean;
  thinq: DiscoveryThinQ;
  device: Device;
  accessoryResolver?: DeviceAccessoryResolver;
}): Promise<PreparedDevice> {
  const {
    log,
    config,
    enableThinQ1,
    thinq,
    device,
    accessoryResolver = defaultDeviceAccessoryResolver,
  } = options;

  if (!enableThinQ1 && device.platform === PlatformType.ThinQ1) {
    log.debug('Thinq1 device is skipped: ', device.toString());
    return { status: 'skipped', reason: 'thinq1-disabled' };
  }

  if (!isDeviceEnabled(config, device)) {
    log.info('Device skipped: ', device.id);
    return { status: 'skipped', reason: 'config-disabled' };
  }

  log.info('[' + device.name + '] Setting up device!');
  const setupSuccess = await thinq.setup(device);

  if (!setupSuccess) {
    log.warn('[' + device.name + '] Failed to setup device!');
    return { status: 'skipped', reason: 'setup-failed' };
  }

  const accessoryType = accessoryResolver.make(device);
  if (accessoryType === null) {
    unregisterUnsupportedDevice({ log, thinq, device });
    return { status: 'skipped', reason: 'unsupported' };
  }

  return {
    status: 'ready',
    accessoryType,
    category: accessoryResolver.category(device),
  };
}
