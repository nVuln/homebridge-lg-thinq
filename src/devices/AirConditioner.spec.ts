import { describe, expect, jest, test } from '@jest/globals';
import type { Device } from '../lib/Device.js';
import {
  ACModelType,
  ACStatus,
  Config,
  FAN_SPEED_AUTO,
  airQualityCharacteristicUpdateFromState,
  coolModeFeatureCommandFromState,
  fanCharacteristicUpdateFromState,
  fanRotationSpeedProps,
  fanV2CharacteristicUpdateFromState,
  featureToggleValue,
  heaterCoolerCharacteristicUpdateFromState,
  humiditySensorCharacteristicUpdateFromState,
  modelFeatureToggleValue,
  readAirConditionerState,
  swingCommandsForMode,
  targetHeaterCoolerSetupForConfig,
  targetOpModeFromHomeKit,
  temperatureRangePropsFromRange,
  temperatureKeepAliveCommandForDevice,
  temperatureSensorCharacteristicUpdateFromState,
  thresholdTemperatureUpdateFromState,
  windStrengthFromRotationSpeed,
  windStrengthFromTargetFanState,
} from './AirConditioner.js';

const baseConfig: Config = {
  ac_swing_mode: 'BOTH',
  ac_air_quality: false,
  ac_mode: 'BOTH',
  ac_temperature_sensor: false,
  ac_humidity_sensor: false,
  ac_led_control: false,
  ac_fan_control: false,
  ac_jet_control: false,
  ac_temperature_unit: 'c',
  ac_buttons: [],
  ac_air_clean: false,
  ac_energy_save: false,
};

const createDevice = (modelType = ACModelType.RAC) => ({
  deviceModel: {
    data: {
      Info: {
        modelType,
      },
    },
    lookupMonitorValue: jest.fn(),
    value: jest.fn(),
  },
}) as unknown as Device;

const logger = {
  warn: jest.fn(),
} as any;

describe('readAirConditionerState', () => {
  test('normalizes ThinQ snapshot values into HomeKit state', () => {
    const status = readAirConditionerState({
      'airState.operation': '1',
      'airState.opMode': '4',
      'airState.humidity.current': '455',
      'airState.tempState.current': '25',
      'airState.tempState.target': 24,
      'airState.quality.sensorMon': 0,
      'airState.quality.overall': '2',
      'airState.quality.PM2': '8',
      'airState.quality.PM10': 12,
      'airState.windStrength': '4',
      'airState.wDir.vStep': 100,
      'airState.wDir.hStep': 0,
      'airState.lightingState.displayControl': 'ON',
      'airState.energy.onCurrent': '1234',
    }, createDevice(), baseConfig, logger);

    expect(status.opMode).toBe(4);
    expect(status.isPowerOn).toBe(true);
    expect(status.currentRelativeHumidity).toBe(45.5);
    expect(status.currentTemperature).toBe(25);
    expect(status.targetTemperature).toBe(24);
    expect(status.airQuality).toEqual({
      isOn: true,
      overall: 2,
      PM2: 8,
      PM10: 12,
    });
    expect(status.windStrength).toBe(50);
    expect(status.isWindStrengthAuto).toBe(false);
    expect(status.isSwingOn).toBe(true);
    expect(status.isLightOn).toBe(true);
    expect(status.currentConsumption).toBe(12.34);
    expect(status.type).toBe(ACModelType.RAC);
  });

  test('uses safe defaults when snapshot data is missing', () => {
    const status = readAirConditionerState(undefined, createDevice(), baseConfig, logger);

    expect(status.opMode).toBe(0);
    expect(status.isPowerOn).toBe(false);
    expect(status.currentRelativeHumidity).toBe(0);
    expect(status.currentTemperature).toBe(0);
    expect(status.targetTemperature).toBe(0);
    expect(status.airQuality).toBeNull();
    expect(status.windStrength).toBe(5);
    expect(status.isWindStrengthAuto).toBe(false);
    expect(status.isSwingOn).toBe(false);
    expect(status.isLightOn).toBe(false);
    expect(status.currentConsumption).toBe(0);
  });

  test('detects automatic fan speed', () => {
    const status = readAirConditionerState({
      'airState.windStrength': FAN_SPEED_AUTO,
    }, createDevice(), baseConfig, logger);

    expect(status.windStrength).toBe(5);
    expect(status.isWindStrengthAuto).toBe(true);
  });

  test('falls back to RAC model type when device metadata is incomplete', () => {
    const device = {
      deviceModel: {
        data: {},
      },
    } as unknown as Device;
    const status = readAirConditionerState({}, device, baseConfig, logger);

    expect(status.type).toBe(ACModelType.RAC);
  });

  test('exposes the same state through the compatibility status wrapper', () => {
    const status = new ACStatus({
      'airState.operation': 1,
      'airState.opMode': 4,
      'airState.humidity.current': 55,
      'airState.tempState.current': 23,
      'airState.tempState.target': 22,
      'airState.windStrength': 6,
      'airState.wDir.vStep': 0,
      'airState.wDir.hStep': 100,
      'airState.lightingState.displayControl': 0,
      'airState.energy.onCurrent': 500,
    }, createDevice(ACModelType.AWHP), baseConfig, logger);

    expect(status.opMode).toBe(4);
    expect(status.isPowerOn).toBe(true);
    expect(status.currentRelativeHumidity).toBe(55);
    expect(status.currentTemperature).toBe(23);
    expect(status.targetTemperature).toBe(22);
    expect(status.windStrength).toBe(100);
    expect(status.isSwingOn).toBe(true);
    expect(status.isLightOn).toBe(false);
    expect(status.currentConsumption).toBe(5);
    expect(status.type).toBe(ACModelType.AWHP);
  });
});

describe('AirConditioner command mapping', () => {
  const targetHeaterCoolerState = {
    AUTO: 0,
    HEAT: 1,
    COOL: 2,
  };

  const currentHeaterCoolerState = {
    INACTIVE: 0,
    IDLE: 1,
    HEATING: 2,
    COOLING: 3,
  };

  const targetFanState = {
    AUTO: 0,
    MANUAL: 1,
  };

  const active = {
    ACTIVE: 1,
    INACTIVE: 0,
  };

  const swingMode = {
    SWING_ENABLED: 1,
    SWING_DISABLED: 0,
  };

  test('maps HomeKit target states to LG operation modes', () => {
    expect(targetOpModeFromHomeKit(0, 99, targetHeaterCoolerState)).toBe(6);
    expect(targetOpModeFromHomeKit(1, 99, targetHeaterCoolerState)).toBe(4);
    expect(targetOpModeFromHomeKit(2, 99, targetHeaterCoolerState)).toBe(0);
    expect(targetOpModeFromHomeKit(7, 99, targetHeaterCoolerState)).toBe(99);
  });

  test('maps AC mode config to target heater/cooler setup', () => {
    expect(targetHeaterCoolerSetupForConfig('BOTH', targetHeaterCoolerState)).toEqual({
      validValues: [0, 2, 1],
      initialValue: 2,
    });

    expect(targetHeaterCoolerSetupForConfig('COOLING', targetHeaterCoolerState)).toEqual({
      validValues: [2],
      initialValue: 2,
    });

    expect(targetHeaterCoolerSetupForConfig('HEATING', targetHeaterCoolerState)).toEqual({
      validValues: [1],
      initialValue: 1,
    });

    expect(targetHeaterCoolerSetupForConfig('UNKNOWN', targetHeaterCoolerState)).toBeNull();
  });

  test('maps service setup props for temperature ranges and fan rotation speed', () => {
    expect(temperatureRangePropsFromRange({
      min: 16,
      max: 30,
      step: 0.5,
    } as any, temperature => temperature + 1)).toEqual({
      minValue: 17,
      maxValue: 31,
      minStep: 0.5,
    });

    expect(temperatureRangePropsFromRange({
      min: 16,
      max: 30,
      step: 0,
    } as any, temperature => temperature)).toEqual({
      minValue: 16,
      maxValue: 30,
      minStep: 0.01,
    });

    expect(temperatureRangePropsFromRange(null, temperature => temperature)).toBeNull();
    expect(fanRotationSpeedProps()).toEqual({
      minValue: 0,
      maxValue: 5,
      minStep: 0.1,
    });
  });

  test('maps LG operation state to HomeKit heater/cooler characteristic updates', () => {
    expect(heaterCoolerCharacteristicUpdateFromState({
      isPowerOn: false,
      opMode: 0,
      currentTemperature: 24,
      targetTemperature: 22,
    }, currentHeaterCoolerState, targetHeaterCoolerState)).toEqual({
      currentState: 0,
    });

    expect(heaterCoolerCharacteristicUpdateFromState({
      isPowerOn: true,
      opMode: 0,
      currentTemperature: 24,
      targetTemperature: 22,
    }, currentHeaterCoolerState, targetHeaterCoolerState)).toEqual({
      currentState: 3,
      targetState: 2,
    });

    expect(heaterCoolerCharacteristicUpdateFromState({
      isPowerOn: true,
      opMode: 4,
      currentTemperature: 20,
      targetTemperature: 22,
    }, currentHeaterCoolerState, targetHeaterCoolerState)).toEqual({
      currentState: 2,
      targetState: 1,
    });
  });

  test('maps auto mode to heating or cooling based on temperature delta', () => {
    expect(heaterCoolerCharacteristicUpdateFromState({
      isPowerOn: true,
      opMode: 6,
      currentTemperature: 20,
      targetTemperature: 22,
    }, currentHeaterCoolerState, targetHeaterCoolerState)).toEqual({
      currentState: 2,
      targetState: 1,
    });

    expect(heaterCoolerCharacteristicUpdateFromState({
      isPowerOn: true,
      opMode: 6,
      currentTemperature: 24,
      targetTemperature: 22,
    }, currentHeaterCoolerState, targetHeaterCoolerState)).toEqual({
      currentState: 3,
      targetState: 2,
    });

    expect(heaterCoolerCharacteristicUpdateFromState({
      isPowerOn: true,
      opMode: 2,
      currentTemperature: 24,
      targetTemperature: 22,
    }, currentHeaterCoolerState, targetHeaterCoolerState)).toBeNull();
  });

  test('maps HomeKit fan target state to LG wind strength', () => {
    expect(windStrengthFromTargetFanState(0, targetFanState)).toBe(FAN_SPEED_AUTO);
    expect(windStrengthFromTargetFanState(1, targetFanState)).toBe(6);
  });

  test('maps state to primary fan-service characteristic updates', () => {
    expect(fanCharacteristicUpdateFromState({
      windStrength: 50,
      isSwingOn: true,
    }, swingMode)).toEqual({
      rotationSpeed: 50,
      swingMode: 1,
    });

    expect(fanCharacteristicUpdateFromState({
      windStrength: 5,
      isSwingOn: false,
    }, swingMode)).toEqual({
      rotationSpeed: 5,
      swingMode: 0,
    });
  });

  test('maps state to FanV2 characteristic updates', () => {
    expect(fanV2CharacteristicUpdateFromState({
      isPowerOn: true,
      isSwingOn: true,
      windStrength: 50,
      isWindStrengthAuto: false,
    }, active, targetFanState, swingMode)).toEqual({
      active: 1,
      targetFanState: 1,
      rotationSpeed: 50,
      swingMode: 1,
    });

    expect(fanV2CharacteristicUpdateFromState({
      isPowerOn: false,
      isSwingOn: false,
      windStrength: 5,
      isWindStrengthAuto: true,
    }, active, targetFanState, swingMode)).toEqual({
      active: 0,
      targetFanState: 0,
      swingMode: 0,
    });
  });

  test('maps HomeKit rotation speed to LG wind strength', () => {
    expect(windStrengthFromRotationSpeed(1)).toBe(2);
    expect(windStrengthFromRotationSpeed(3)).toBe(4);
    expect(windStrengthFromRotationSpeed(0)).toBe(2);
    expect(windStrengthFromRotationSpeed('not-a-number')).toBeNull();
  });

  test('builds swing command payloads for supported swing modes', () => {
    expect(swingCommandsForMode(true, 'BOTH')).toEqual([{
      payload: {
        dataKey: null,
        dataValue: null,
        dataSetList: {
          'airState.wDir.vStep': '100',
          'airState.wDir.hStep': '100',
        },
        dataGetList: null,
      },
      command: 'Set',
      ctrlKey: 'favoriteCtrl',
      snapshotUpdates: {
        'airState.wDir.vStep': '100',
        'airState.wDir.hStep': '100',
      },
    }]);

    expect(swingCommandsForMode(false, 'VERTICAL')).toEqual([{
      payload: {
        dataKey: 'airState.wDir.vStep',
        dataValue: '0',
      },
      snapshotUpdates: {
        'airState.wDir.vStep': '0',
      },
    }]);

    expect(swingCommandsForMode(true, 'HORIZONTAL')).toEqual([{
      payload: {
        dataKey: 'airState.wDir.hStep',
        dataValue: '100',
      },
      snapshotUpdates: {
        'airState.wDir.hStep': '100',
      },
    }]);

    expect(swingCommandsForMode(true, 'DISABLED')).toEqual([]);
  });

  test('maps feature-toggle snapshot values only when enabled and supported', () => {
    const snapshot = {
      'airState.wMode.jet': 1,
      'airState.powerSave.basic': 0,
    };

    expect(featureToggleValue(snapshot, 'airState.wMode.jet')).toBe(true);
    expect(featureToggleValue(snapshot, 'airState.powerSave.basic')).toBe(false);
    expect(featureToggleValue(snapshot, 'airState.wMode.jet', false)).toBeUndefined();
    expect(modelFeatureToggleValue(snapshot, 'airState.wMode.jet', 'RAC_056905', ['RAC_056905'])).toBe(true);
    expect(modelFeatureToggleValue(snapshot, 'airState.wMode.jet', 'OTHER_MODEL', ['RAC_056905'])).toBeUndefined();
    expect(modelFeatureToggleValue(snapshot, 'airState.wMode.jet', 'RAC_056905', ['RAC_056905'], false)).toBeUndefined();
  });

  test('builds cool-mode-only feature commands', () => {
    expect(coolModeFeatureCommandFromState({
      isPowerOn: true,
      opMode: 0,
    }, true, 'airState.wMode.jet')).toEqual({
      payload: {
        dataKey: 'airState.wMode.jet',
        dataValue: 1,
      },
      snapshotUpdates: {
        'airState.wMode.jet': 1,
      },
    });

    expect(coolModeFeatureCommandFromState({
      isPowerOn: true,
      opMode: 0,
    }, false, 'airState.powerSave.basic')).toEqual({
      payload: {
        dataKey: 'airState.powerSave.basic',
        dataValue: 0,
      },
      snapshotUpdates: {
        'airState.powerSave.basic': 0,
      },
    });

    expect(coolModeFeatureCommandFromState({
      isPowerOn: false,
      opMode: 0,
    }, true, 'airState.wMode.jet')).toBeNull();

    expect(coolModeFeatureCommandFromState({
      isPowerOn: true,
      opMode: 4,
    }, true, 'airState.wMode.jet')).toBeNull();
  });

  test('builds temperature keepalive commands only for online devices', () => {
    expect(temperatureKeepAliveCommandForDevice({
      id: 'ac-id',
      online: true,
    } as Device)).toEqual({
      deviceId: 'ac-id',
      payload: {
        dataKey: 'airState.mon.timeout',
        dataValue: '70',
      },
      command: 'Set',
      ctrlKey: 'allEventEnable',
      ctrlPath: 'control',
    });

    expect(temperatureKeepAliveCommandForDevice({
      id: 'ac-id',
      online: false,
    } as Device)).toBeNull();
  });

  test('maps air-quality state to optional characteristic updates', () => {
    expect(airQualityCharacteristicUpdateFromState({
      airQuality: {
        isOn: true,
        overall: 2,
        PM2: 8,
        PM10: 12,
      },
    })).toEqual({
      airQuality: 2,
      PM2: 8,
      PM10: 12,
    });

    expect(airQualityCharacteristicUpdateFromState({
      airQuality: {
        isOn: true,
        overall: 1,
        PM2: 0,
        PM10: 0,
      },
    })).toEqual({
      airQuality: 1,
    });

    expect(airQualityCharacteristicUpdateFromState({
      airQuality: {
        isOn: false,
        overall: 1,
        PM2: 8,
        PM10: 12,
      },
    })).toBeNull();
    expect(airQualityCharacteristicUpdateFromState({ airQuality: null })).toBeNull();
    expect(airQualityCharacteristicUpdateFromState({
      airQuality: {
        isOn: true,
        overall: 1,
        PM2: 8,
        PM10: 12,
      },
    }, false)).toBeNull();
  });

  test('maps temperature and humidity sensor updates only when configured', () => {
    expect(temperatureSensorCharacteristicUpdateFromState({
      currentTemperature: 23,
      isPowerOn: true,
    })).toEqual({
      value: 23,
      statusActive: true,
    });

    expect(humiditySensorCharacteristicUpdateFromState({
      currentRelativeHumidity: 45.5,
      isPowerOn: false,
    })).toEqual({
      value: 45.5,
      statusActive: false,
    });

    expect(temperatureSensorCharacteristicUpdateFromState({
      currentTemperature: 23,
      isPowerOn: true,
    }, false)).toBeNull();

    expect(humiditySensorCharacteristicUpdateFromState({
      currentRelativeHumidity: 45.5,
      isPowerOn: true,
    }, false)).toBeNull();
  });

  test('maps current heater/cooler state to threshold temperature updates', () => {
    expect(thresholdTemperatureUpdateFromState(22, 2, currentHeaterCoolerState)).toEqual({
      heatingThresholdTemperature: 22,
    });

    expect(thresholdTemperatureUpdateFromState(24, 3, currentHeaterCoolerState)).toEqual({
      coolingThresholdTemperature: 24,
    });

    expect(thresholdTemperatureUpdateFromState(24, 0, currentHeaterCoolerState)).toBeNull();
    expect(thresholdTemperatureUpdateFromState(24, 1, currentHeaterCoolerState)).toBeNull();
  });
});
