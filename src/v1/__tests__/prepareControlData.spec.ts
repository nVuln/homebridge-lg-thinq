import { describe, test, expect } from '@jest/globals';
import Helper from '../../v1/helper.js';
import { Device } from '../../lib/Device.js';

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
});
