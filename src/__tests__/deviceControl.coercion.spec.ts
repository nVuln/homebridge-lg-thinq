import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { ThinQ } from '../lib/ThinQ.js';
import { ValueType } from '../lib/DeviceModel.js';

describe('ThinQ.deviceControl coercion', () => {
  let thinq: ThinQ;

  beforeEach(() => {
    // Minimal fake platform/config/logger to instantiate ThinQ
    const platform: any = { api: { user: { storagePath: () => process.cwd() } } };
    const config: any = { country: 'US', language: 'en' };
    const logger: any = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };

    thinq = new ThinQ(platform as any, config, logger as any);

    // stub out network calls
    (thinq as any).api = {
      sendCommandToDevice: jest.fn(async () => ({ resultCode: '0000' })) as any,
    } as any;
  });

  test('coerces Bit value (boolean -> 1)', async () => {
    // fake model that reports key 'power' as Bit
    const fakeModel: any = {
      value: (k: string) => (k === 'power' ? { type: ValueType.Bit } : null),
    };

    (thinq as any).deviceModel.dev1 = fakeModel;

    const values: any = { dataKey: 'power', dataValue: true };

    await thinq.deviceControl('dev1', values);

    // assert that api.sendCommandToDevice received coerced numeric value
    expect(((thinq as any).api.sendCommandToDevice as jest.Mock).mock.calls.length).toBe(1);
    const sentValues = ((thinq as any).api.sendCommandToDevice as jest.Mock).mock.calls[0][1];
    expect((sentValues as any).dataValue).toBe(1);
  });

  test('coerces Range value (string -> number)', async () => {
    const fakeModel: any = {
      value: (k: string) => (k === 'temp' ? { type: ValueType.Range } : null),
    };

    (thinq as any).deviceModel.dev2 = fakeModel;

    const values: any = { dataSetList: { temp: '23' } };

    await thinq.deviceControl('dev2', values);

    const sentValues2 = ((thinq as any).api.sendCommandToDevice as jest.Mock).mock.calls[0][1];
    expect(typeof (sentValues2 as any).dataSetList.temp).toBe('number');
    expect((sentValues2 as any).dataSetList.temp).toBe(23);
  });

  test('maps Enum label to enum key using model.enumValue', async () => {
    const fakeModel: any = {
      value: (k: string) => (k === 'mode' ? { type: ValueType.Enum } : null),
      enumValue: (k: string, name: string) => (k === 'mode' && name === 'Cool' ? '1' : null),
    };

    (thinq as any).deviceModel.dev3 = fakeModel;

    const values: any = { dataSetList: { mode: 'Cool' } };

    await thinq.deviceControl('dev3', values);

    const sentValues3 = ((thinq as any).api.sendCommandToDevice as jest.Mock).mock.calls[0][1];
    expect((sentValues3 as any).dataSetList.mode).toBe('1');
  });
});
