import { randomUUID } from 'crypto';
import { MonitorError, NotConnectedError } from '../errors/index.js';
import type { Device } from './Device.js';

export type WorkId = string;
export type WorkIdRegistry = Record<string, WorkId | null>;

export type ThinQ1MonitorApi = {
  sendMonitorCommand(deviceId: string, command: 'Start' | 'Stop', workId: string | null): Promise<any>;
  getMonitorResult(deviceId: string, workId: string | null): Promise<Buffer<ArrayBuffer> | null>;
};

export function hasThinQ1WorkId(workIds: WorkIdRegistry, device: Pick<Device, 'id'>): boolean {
  return device.id in workIds && workIds[device.id] !== null;
}

export async function registerThinQ1WorkId(options: {
  api: ThinQ1MonitorApi;
  workIds: WorkIdRegistry;
  device: Pick<Device, 'id'>;
  createWorkId?: () => string;
}): Promise<WorkId | null> {
  const {
    api,
    workIds,
    device,
    createWorkId = randomUUID,
  } = options;

  const workId = await api.sendMonitorCommand(device.id, 'Start', createWorkId()).then(data => {
    if (data !== undefined && 'workId' in data) {
      return data.workId;
    }

    return null;
  });
  workIds[device.id] = workId;

  return workId;
}

export async function unregisterThinQ1WorkId(options: {
  api: ThinQ1MonitorApi;
  workIds: WorkIdRegistry;
  device: Pick<Device, 'id'>;
}): Promise<void> {
  const { api, workIds, device } = options;

  if (hasThinQ1WorkId(workIds, device)) {
    try {
      await api.sendMonitorCommand(device.id, 'Stop', workIds[device.id]);
    } catch {
      // Keep unregister best-effort so a failed Stop does not block cleanup.
    }

    delete workIds[device.id];
  }
}

export async function pollThinQ1MonitorResult(options: {
  api: ThinQ1MonitorApi;
  workIds: WorkIdRegistry;
  device: Pick<Device, 'id'>;
  createWorkId?: () => string;
}): Promise<Buffer<ArrayBuffer> | null> {
  const {
    api,
    workIds,
    device,
    createWorkId,
  } = options;
  let result: Buffer<ArrayBuffer> | null = null;

  if (!hasThinQ1WorkId(workIds, device)) {
    const workId = await registerThinQ1WorkId({
      api,
      workIds,
      device,
      createWorkId,
    });
    if (workId === undefined || workId === null) {
      return result;
    }
  }

  try {
    result = await api.getMonitorResult(device.id, workIds[device.id]);
  } catch (err) {
    if (err instanceof MonitorError) {
      await unregisterThinQ1WorkId({ api, workIds, device });
      await registerThinQ1WorkId({
        api,
        workIds,
        device,
        createWorkId,
      });

      try {
        result = await api.getMonitorResult(device.id, workIds[device.id]);
      } catch {
        // Preserve existing retry behavior: stop after the single retry.
      }
    } else if (err instanceof NotConnectedError) {
      // Device is offline; preserve the previous null-result behavior.
    } else {
      throw err;
    }
  }

  return result;
}
