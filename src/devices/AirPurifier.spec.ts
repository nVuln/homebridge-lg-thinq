import { describe, expect, test } from '@jest/globals';
import { AirPurifierStatus, readAirPurifierState } from './AirPurifier.js';

describe('readAirPurifierState', () => {
  test('normalizes ThinQ snapshot values into HomeKit state', () => {
    const status = readAirPurifierState({
      'airState.operation': 1,
      'airState.lightingState.signal': 'ON',
      'airState.circulate.rotate': 'ENA',
      'airState.quality.sensorMon': 1,
      'airState.quality.overall': '3',
      'airState.quality.PM2': '7',
      'airState.quality.PM10': 11,
      'airState.windStrength': '4',
      'airState.opMode': 14,
      'airState.filterMngStates.maxTime': 100,
      'airState.filterMngStates.useTime': '10',
      'airState.miscFuncState.airFast': 1,
    });

    expect(status.isPowerOn).toBe(true);
    expect(status.isLightOn).toBe(true);
    expect(status.isSwing).toBe(true);
    expect(status.windStrength).toBe(4);
    expect(status.airQuality).toEqual({
      isOn: true,
      overall: 3,
      PM2: 7,
      PM10: 11,
    });
    expect(status.rotationSpeed).toBe(2);
    expect(status.isNormalMode).toBe(true);
    expect(status.filterUsedTimePercent).toBe(90);
    expect(status.isAirFastEnable).toBe(true);
  });

  test('uses safe defaults when snapshot data is missing', () => {
    const status = readAirPurifierState(undefined);

    expect(status.isPowerOn).toBe(false);
    expect(status.isLightOn).toBe(false);
    expect(status.isSwing).toBe(false);
    expect(status.airQuality).toEqual({
      isOn: false,
      overall: 0,
      PM2: 0,
      PM10: 0,
    });
    expect(status.rotationSpeed).toBe(4);
    expect(status.isNormalMode).toBe(false);
    expect(status.filterUsedTimePercent).toBe(0);
    expect(status.isAirFastEnable).toBe(false);
  });

  test('uses display control light state when signal state is unavailable', () => {
    const status = readAirPurifierState({
      'airState.operation': 1,
      'airState.lightingState.displayControl': 1,
    });

    expect(status.isLightOn).toBe(true);
  });

  test('exposes the same state through the compatibility status wrapper', () => {
    const status = new AirPurifierStatus({
      'airState.operation': 1,
      'airState.lightingState.signal': 0,
      'airState.circulate.rotate': 1,
      'airState.quality.sensorMon': 0,
      'airState.quality.overall': 2,
      'airState.quality.PM2': 5,
      'airState.quality.PM10': 8,
      'airState.windStrength': 7,
      'airState.opMode': 15,
      'airState.filterMngStates.maxTime': 200,
      'airState.filterMngStates.useTime': 40,
      'airState.miscFuncState.airFast': 0,
    });

    expect(status.isPowerOn).toBe(true);
    expect(status.isLightOn).toBe(false);
    expect(status.isSwing).toBe(true);
    expect(status.airQuality).toEqual({
      isOn: true,
      overall: 2,
      PM2: 5,
      PM10: 8,
    });
    expect(status.rotationSpeed).toBe(4);
    expect(status.windStrength).toBe(7);
    expect(status.isNormalMode).toBe(false);
    expect(status.filterMaxTime).toBe(200);
    expect(status.filterUseTime).toBe(40);
    expect(status.filterUsedTimePercent).toBe(80);
    expect(status.isAirFastEnable).toBe(false);
  });
});
