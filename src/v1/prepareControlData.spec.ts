import { describe, test, expect, jest } from '@jest/globals';
import Helper, {
  lookupEnum,
  loopupEnum,
  thinq1SnapshotForDeviceType,
} from './helper.js';
import { Device } from '../lib/Device.js';
import { DeviceType } from '../lib/constants.js';
import type { DeviceModel } from '../lib/DeviceModel.js';

const createAcModel = (decodedMonitor: Record<string, unknown>) => ({
  data: {},
  decodeMonitor: jest.fn(() => decodedMonitor),
  enumName: jest.fn((key: string, value: unknown) => {
    if (key === 'Operation' && value === '0') {
      return '@AC_MAIN_OPERATION_OFF_W';
    }

    return '@AC_MAIN_OPERATION_RIGHT_ON_W';
  }),
  value: jest.fn((key: string) => {
    if (key === 'TempCur' || key === 'TempCfg') {
      return {
        min: 16,
        max: 30,
      };
    }

    return null;
  }),
}) as unknown as DeviceModel;

describe('v1 Helper.prepareControlData', () => {
  test('builds BINARY(BYTE) payload with boolean -> numeric coercion', () => {
    const device = new Device({
      deviceId: 'dev1',
      alias: 'd',
      modelJsonUri: '',
      deviceType: 0,
      snapshot: { raw: {} },
    } as any);

    device.deviceModel = {
      data: {
        ControlWifi: {
          type: 'BINARY(BYTE)',
          action: { SetControl: { data: '[{{myKey}}]' } },
        },
      },
    } as any;

    const out = Helper.prepareControlData(device as any, 'myKey', true as any);

    expect(out.value).toBe('ControlData');
    const expected = Buffer.from(String.fromCharCode(1)).toString('base64');
    expect(out.data).toBe(expected);
    expect(out.format).toBe('B64');
  });

  test('non-numeric replacement falls back to 0', () => {
    const device = new Device({
      deviceId: 'dev2',
      alias: 'd',
      modelJsonUri: '',
      deviceType: 0,
      snapshot: { raw: {} },
    } as any);

    device.deviceModel = {
      data: {
        ControlWifi: {
          type: 'BINARY(BYTE)',
          action: { SetControl: { data: '[{{k}}]' } },
        },
      },
    } as any;

    const out = Helper.prepareControlData(device as any, 'k', 'non-numeric');
    const expected = Buffer.from(String.fromCharCode(0)).toString('base64');
    expect(out.data).toBe(expected);
  });

  test('does not mutate the cached raw snapshot when building a control payload', () => {
    const raw = {
      k: 0,
      unchanged: 2,
    };
    const device = new Device({
      deviceId: 'dev3',
      alias: 'd',
      modelJsonUri: '',
      deviceType: 0,
      snapshot: { raw },
    } as any);

    device.deviceModel = {
      data: {
        ControlWifi: {
          type: 'BINARY(BYTE)',
          action: { SetControl: { data: '[{{k}},{{unchanged}}]' } },
        },
      },
    } as any;

    Helper.prepareControlData(device as any, 'k', true);

    expect(raw).toEqual({
      k: 0,
      unchanged: 2,
    });
  });
});

describe('v1 Helper transforms', () => {
  test('selects a ThinQ1 snapshot transform by device type', () => {
    const model = createAcModel({
      Operation: '1',
      OpMode: '4',
      TempCur: '12',
      TempCfg: '24',
      WindStrength: '3',
    });

    const snapshot = thinq1SnapshotForDeviceType('AC', model, model.decodeMonitor({}));

    expect(snapshot).toEqual(expect.objectContaining({
      'airState.operation': true,
      'airState.opMode': 4,
      'airState.tempState.current': 16,
      'airState.tempState.target': 24,
      'airState.windStrength': 3,
    }));
  });

  test('marks transformed ThinQ1 snapshots online and preserves raw monitor data', () => {
    const decodedMonitor = {
      Operation: '1',
      OpMode: '4',
      TempCur: '25',
      TempCfg: '24',
    };
    const device = new Device({
      deviceId: 'dev-ac',
      alias: 'AC',
      modelJsonUri: '',
      deviceType: DeviceType.AC,
      snapshot: {},
    } as any);
    device.deviceModel = createAcModel(decodedMonitor);

    Helper.transform(device, { encoded: 'monitor' });

    expect(device.data.online).toBe(true);
    expect(device.snapshot.online).toBe(true);
    expect(device.snapshot.raw).toBe(decodedMonitor);
    expect(device.snapshot['airState.tempState.current']).toBe(25);
  });

  test('leaves unsupported ThinQ1 device types unchanged', () => {
    const model = createAcModel({});
    const device = new Device({
      deviceId: 'unsupported',
      alias: 'Unsupported',
      modelJsonUri: '',
      deviceType: DeviceType.TV,
      snapshot: { existing: true },
    } as any);
    device.deviceModel = model;

    Helper.transform(device, { raw: true });

    expect(device.snapshot).toEqual({ existing: true });
  });

  test('looks up decoded monitor enum names with the corrected helper name', () => {
    const model = createAcModel({});
    const decodedMonitor = { Operation: '1' };

    expect(lookupEnum(model, decodedMonitor, 'Operation')).toBe('@AC_MAIN_OPERATION_RIGHT_ON_W');
    expect(loopupEnum(model, decodedMonitor, 'Operation')).toBe('@AC_MAIN_OPERATION_RIGHT_ON_W');
    expect(lookupEnum(model, decodedMonitor, 'Missing')).toBeNull();
  });
});
