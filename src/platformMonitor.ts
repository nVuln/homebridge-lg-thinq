import type { EventEmitter } from 'events';
import type { Logging, PlatformAccessory } from 'homebridge';
import type { AccessoryContext } from './baseDevice.js';
import { ManualProcessNeeded } from './errors/index.js';
import type { Device } from './lib/Device.js';
import { PlatformType } from './lib/constants.js';
import type { ThinQ } from './lib/ThinQ.js';

export type MonitorInterval = ReturnType<typeof setInterval>;
export type MonitorThinQ = Pick<ThinQ, 'devices' | 'pollMonitor' | 'registerMQTTListener'>;

export function accessoriesForPlatform(
  accessories: PlatformAccessory<AccessoryContext>[],
  platform: PlatformType,
): PlatformAccessory<AccessoryContext>[] {
  return accessories.filter(accessory => accessory.context.device.platform === platform);
}

export function hasEnabledThinQ1Accessories(
  accessories: PlatformAccessory<AccessoryContext>[],
  enableThinQ1: boolean,
): boolean {
  return enableThinQ1 && accessoriesForPlatform(accessories, PlatformType.ThinQ1).length > 0;
}

export async function pollThinQ2Devices(options: {
  thinq: Pick<ThinQ, 'devices'>;
  events: EventEmitter;
}): Promise<void> {
  const { thinq, events } = options;
  const devices: Device[] = await thinq.devices();

  devices.filter(device => device.platform === PlatformType.ThinQ2).forEach(device => {
    events.emit(device.id, device.snapshot);
  });
}

export function emitThinQ2MqttUpdate(events: EventEmitter, data: unknown): void {
  if (typeof data !== 'object' || data === null || !('data' in data) || !('deviceId' in data)) {
    return;
  }

  const message = data as {
    deviceId: string;
    data?: {
      state?: {
        reported?: unknown;
      };
    };
  };

  events.emit(message.deviceId, message.data?.state?.reported);
}

export async function pollThinQ1Accessories(options: {
  thinq: Pick<ThinQ, 'pollMonitor'>;
  accessories: PlatformAccessory<AccessoryContext>[];
  events: EventEmitter;
  enableThinQ1: boolean;
}): Promise<void> {
  const { thinq, accessories, events, enableThinQ1 } = options;

  for (const accessory of accessories) {
    const device: Device = accessory.context.device;
    if (device.platform === PlatformType.ThinQ1 && enableThinQ1) {
      const deviceWithSnapshot = await thinq.pollMonitor(device);
      const snapshot = deviceWithSnapshot.snapshot;
      if (snapshot && snapshot.raw !== null) {
        events.emit(device.id, snapshot);
      }
    }
  }
}

export function removeMonitorInterval(
  monitorIntervals: MonitorInterval[],
  interval: MonitorInterval,
): void {
  const intervalIndex = monitorIntervals.indexOf(interval);
  if (intervalIndex >= 0) {
    monitorIntervals.splice(intervalIndex, 1);
  }
}

export function handleThinQ1PollError(options: {
  err: unknown;
  log: Logging;
  interval: MonitorInterval;
  monitorIntervals: MonitorInterval[];
}): boolean {
  const { err, log, interval, monitorIntervals } = options;

  if (!(err instanceof ManualProcessNeeded)) {
    return false;
  }

  log.info('Stop polling device data.');
  log.warn(err.message);
  clearInterval(interval);
  removeMonitorInterval(monitorIntervals, interval);
  return true;
}

export async function startThinQ2Monitor(options: {
  log: Logging;
  thinq: MonitorThinQ;
  events: EventEmitter;
  intervalTime: number;
  monitorIntervals: MonitorInterval[];
}): Promise<void> {
  const { log, thinq, events, intervalTime, monitorIntervals } = options;
  const thinq2Interval = setInterval(() => {
    pollThinQ2Devices({ thinq, events }).catch(err => {
      log.debug('ThinQ2 polling failed:', err);
    });
  }, intervalTime);
  monitorIntervals.push(thinq2Interval);

  log.info('Start MQTT listener for ThinQ2 devices');
  await thinq.registerMQTTListener((data) => {
    emitThinQ2MqttUpdate(events, data);
  });
}

export function startThinQ1Monitor(options: {
  log: Logging;
  thinq: MonitorThinQ;
  accessories: PlatformAccessory<AccessoryContext>[];
  events: EventEmitter;
  intervalTime: number;
  refreshInterval: unknown;
  enableThinQ1: boolean;
  monitorIntervals: MonitorInterval[];
}): void {
  const {
    log,
    thinq,
    accessories,
    events,
    intervalTime,
    refreshInterval,
    enableThinQ1,
    monitorIntervals,
  } = options;

  const configuredRefreshInterval = Number(refreshInterval);
  const refreshSeconds = Number.isFinite(configuredRefreshInterval) && configuredRefreshInterval > 0
    ? configuredRefreshInterval
    : intervalTime / 1000;

  log.info('Start polling device data every ' + refreshSeconds + ' seconds.');
  const interval = setInterval(async () => {
    try {
      await pollThinQ1Accessories({
        thinq,
        accessories,
        events,
        enableThinQ1,
      });
    } catch (err) {
      handleThinQ1PollError({
        err,
        log,
        interval,
        monitorIntervals,
      });
    }
  }, intervalTime);
  monitorIntervals.push(interval);
}

export function clearMonitorIntervals(monitorIntervals: MonitorInterval[]): void {
  while (monitorIntervals.length) {
    const interval = monitorIntervals.pop();
    if (interval) {
      clearInterval(interval);
    }
  }
}
