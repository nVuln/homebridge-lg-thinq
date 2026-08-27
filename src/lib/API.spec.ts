/* eslint-disable dot-notation */
import { API } from './API.js';
import { NotConnectedError } from '../errors/index.js';
import { Logger } from 'homebridge';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';

describe('API', () => {
  let api: API;
  let mockLogger: Logger;

  beforeEach(() => {
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as unknown as Logger;

    api = new API('EC', 'en-US', mockLogger);
  });

  test('should initialize with default values', () => {
    expect(api).toBeDefined();
    expect(api.client_id).toBeUndefined();
    expect(api.httpClient).toBeDefined();
  });

  test('can be constructed by JavaScript callers without a logger', async () => {
    const apiWithoutLogger = new API('US', 'en-US');

    await expect(apiWithoutLogger.getRequest('')).rejects.toThrow('Invalid URI');
  });

  test('should set username and password', () => {
    api.setUsernamePassword('testUser', 'testPass');
    expect(api['username']).toBe('testUser');
    expect(api['password']).toBe('testPass');
  });

  test('should set refresh token', () => {
    api.setRefreshToken('testRefreshToken');
    expect(api['session'].refreshToken).toBe('testRefreshToken');
  });

  test('should handle device list retrieval', async () => {
    const mockHomes = [{ homeId: 'home1' }];
    const mockDevices = [{ id: 'device1' }, { id: 'device2' }];

    jest.spyOn(api, 'getListHomes').mockResolvedValueOnce(mockHomes);
    jest.spyOn(api.httpClient, 'request').mockResolvedValueOnce({
      data: { result: { devices: mockDevices } },
    });

    const devices = await api.getListDevices();
    expect(devices).toEqual(mockDevices);
  });

  test('propagates not-connected request failures', async () => {
    api['_gateway'] = {
      thinq1_url: '',
      thinq2_url: 'https://example.com/',
    } as any;
    jest.spyOn(api.httpClient, 'request').mockRejectedValueOnce(new NotConnectedError('offline'));

    await expect(api.getRequest('service/homes')).rejects.toThrow(NotConnectedError);
  });

  test('logs benign device command rejections at debug, not error', async () => {
    api['_gateway'] = {
      thinq1_url: '',
      thinq2_url: 'https://example.com/',
    } as any;
    jest.spyOn(api.httpClient, 'request').mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 400, data: { resultCode: '0101', result: '' } },
      stack: 'stack',
    });

    const result = await api.getRequest('service/devices/x/control-sync');

    expect(result).toEqual({});
    expect(mockLogger.error).not.toHaveBeenCalled();
    expect(mockLogger.debug).toHaveBeenCalledWith(
      expect.stringContaining('resultCode 0101'),
      expect.objectContaining({ resultCode: '0101' }),
      undefined,
    );
  });

  test('logs unexpected axios errors at error level', async () => {
    api['_gateway'] = {
      thinq1_url: '',
      thinq2_url: 'https://example.com/',
    } as any;
    jest.spyOn(api.httpClient, 'request').mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 500, data: { resultCode: '9999', result: '' } },
      stack: 'stack',
    });

    const result = await api.getRequest('service/devices/x/control-sync');

    expect(result).toEqual({});
    expect(mockLogger.error).toHaveBeenCalledWith(
      'axios request error: ',
      expect.objectContaining({ resultCode: '9999' }),
      undefined,
    );
  });

  test('should send command to device', async () => {
    const mockRequest = jest.spyOn(api.httpClient, 'request').mockResolvedValueOnce({ data: { success: true } });

    const result = await api.sendCommandToDevice('device1', { key: 'value' }, 'Set');
    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'post',
        url: expect.stringContaining('/devices/device1/control-sync'),
        data: expect.objectContaining({
          ctrlKey: 'basicCtrl',
          command: 'Set',
          key: 'value',
        }),
      }),
    );
    expect(result).toEqual({ success: true });
  });
});
