import { describe, expect, test } from '@jest/globals';
import { DehumidifierStatus, readDehumidifierState } from './Dehumidifier.js';

describe('readDehumidifierState', () => {
  test('normalizes ThinQ snapshot values into HomeKit state', () => {
    const status = readDehumidifierState({
      'airState.operation': 1,
      'airState.opMode': 18,
      'airState.windStrength': '6',
      'airState.humidity.current': '65',
      'airState.humidity.desired': 55,
      'airState.notificationExt': 'WATER_FULL',
    });

    expect(status.isPowerOn).toBe(true);
    expect(status.isDehumidifying).toBe(true);
    expect(status.humidityCurrent).toBe(65);
    expect(status.humidityTarget).toBe(55);
    expect(status.rotationSpeed).toBe(2);
    expect(status.isWaterTankFull).toBe(true);
  });

  test('uses safe defaults when snapshot data is missing', () => {
    const status = readDehumidifierState(undefined);

    expect(status.isPowerOn).toBe(false);
    expect(status.isDehumidifying).toBe(false);
    expect(status.humidityCurrent).toBe(0);
    expect(status.humidityTarget).toBe(0);
    expect(status.rotationSpeed).toBe(2);
    expect(status.isWaterTankFull).toBe(false);
  });

  test('exposes the same state through the compatibility status wrapper', () => {
    const status = new DehumidifierStatus({
      'airState.operation': 1,
      'airState.opMode': 17,
      'airState.windStrength': 2,
      'airState.humidity.current': 60,
      'airState.humidity.desired': 60,
      'airState.notificationExt': 0,
    });

    expect(status.isPowerOn).toBe(true);
    expect(status.opMode).toBe(17);
    expect(status.windStrength).toBe(2);
    expect(status.isDehumidifying).toBe(true);
    expect(status.humidityCurrent).toBe(60);
    expect(status.humidityTarget).toBe(60);
    expect(status.rotationSpeed).toBe(1);
    expect(status.isWaterTankFull).toBe(false);
  });
});
