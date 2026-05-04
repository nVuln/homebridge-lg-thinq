import { describe, expect, jest, test } from '@jest/globals';
import { MonitorError, NotConnectedError } from '../errors/index.js';
import {
  hasThinQ1WorkId,
  pollThinQ1MonitorResult,
  registerThinQ1WorkId,
  unregisterThinQ1WorkId,
  WorkIdRegistry,
} from './thinq1Monitor.js';

const device = { id: 'device-1' } as any;
const monitorResult = Buffer.from('monitor') as Buffer<ArrayBuffer>;

function fakeApi(value: Record<string, unknown> = {}) {
  return {
    sendMonitorCommand: jest.fn(async () => ({ workId: 'work-id' })),
    getMonitorResult: jest.fn(async () => monitorResult),
    ...value,
  } as any;
}

describe('ThinQ1 monitor helpers', () => {
  test('tracks whether a ThinQ1 work id is registered', () => {
    expect(hasThinQ1WorkId({}, device)).toBe(false);
    expect(hasThinQ1WorkId({ 'device-1': null }, device)).toBe(false);
    expect(hasThinQ1WorkId({ 'device-1': 'work-id' }, device)).toBe(true);
  });

  test('registers and stores a ThinQ1 work id', async () => {
    const api = fakeApi();
    const workIds: WorkIdRegistry = {};

    const workId = await registerThinQ1WorkId({
      api,
      workIds,
      device,
      createWorkId: () => 'generated-id',
    });

    expect(workId).toBe('work-id');
    expect(workIds['device-1']).toBe('work-id');
    expect(api.sendMonitorCommand).toHaveBeenCalledWith('device-1', 'Start', 'generated-id');
  });

  test('unregisters ThinQ1 work ids best-effort', async () => {
    const api = fakeApi({
      sendMonitorCommand: jest.fn(async () => {
        throw new Error('stop failed');
      }),
    });
    const workIds: WorkIdRegistry = {
      'device-1': 'work-id',
    };

    await unregisterThinQ1WorkId({ api, workIds, device });

    expect(api.sendMonitorCommand).toHaveBeenCalledWith('device-1', 'Stop', 'work-id');
    expect('device-1' in workIds).toBe(false);
  });

  test('returns null when a missing work id cannot be registered', async () => {
    const api = fakeApi({
      sendMonitorCommand: jest.fn(async () => ({})),
    });
    const workIds: WorkIdRegistry = {};

    const result = await pollThinQ1MonitorResult({
      api,
      workIds,
      device,
      createWorkId: () => 'generated-id',
    });

    expect(result).toBeNull();
    expect(workIds['device-1']).toBeNull();
    expect(api.getMonitorResult).not.toHaveBeenCalled();
  });

  test('polls monitor results with an existing work id', async () => {
    const api = fakeApi();
    const workIds: WorkIdRegistry = {
      'device-1': 'work-id',
    };

    const result = await pollThinQ1MonitorResult({ api, workIds, device });

    expect(result).toBe(monitorResult);
    expect(api.sendMonitorCommand).not.toHaveBeenCalled();
    expect(api.getMonitorResult).toHaveBeenCalledWith('device-1', 'work-id');
  });

  test('restarts the monitor once after MonitorError', async () => {
    let pollCount = 0;
    const api = fakeApi({
      sendMonitorCommand: jest.fn(async (deviceId: string, command: string) => {
        void deviceId;
        if (command === 'Start') {
          return { workId: 'new-work-id' };
        }

        return {};
      }),
      getMonitorResult: jest.fn(async () => {
        pollCount++;
        if (pollCount === 1) {
          throw new MonitorError('restart monitor');
        }

        return monitorResult;
      }),
    });
    const workIds: WorkIdRegistry = {
      'device-1': 'old-work-id',
    };

    const result = await pollThinQ1MonitorResult({
      api,
      workIds,
      device,
      createWorkId: () => 'generated-id',
    });

    expect(result).toBe(monitorResult);
    expect(api.sendMonitorCommand).toHaveBeenNthCalledWith(1, 'device-1', 'Stop', 'old-work-id');
    expect(api.sendMonitorCommand).toHaveBeenNthCalledWith(2, 'device-1', 'Start', 'generated-id');
    expect(api.getMonitorResult).toHaveBeenNthCalledWith(1, 'device-1', 'old-work-id');
    expect(api.getMonitorResult).toHaveBeenNthCalledWith(2, 'device-1', 'new-work-id');
  });

  test('swallows NotConnectedError and returns null', async () => {
    const api = fakeApi({
      getMonitorResult: jest.fn(async () => {
        throw new NotConnectedError('offline');
      }),
    });
    const workIds: WorkIdRegistry = {
      'device-1': 'work-id',
    };

    await expect(pollThinQ1MonitorResult({ api, workIds, device })).resolves.toBeNull();
  });

  test('rethrows unexpected polling errors', async () => {
    const api = fakeApi({
      getMonitorResult: jest.fn(async () => {
        throw new Error('unexpected');
      }),
    });
    const workIds: WorkIdRegistry = {
      'device-1': 'work-id',
    };

    await expect(pollThinQ1MonitorResult({ api, workIds, device })).rejects.toThrow('unexpected');
  });
});
