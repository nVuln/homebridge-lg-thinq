import { describe, expect, test } from '@jest/globals';
import {
  clampCookingTemperature,
  cookingAlarmServiceUpdate,
  cooktopOperationDuration,
  cookingStopCommand,
  cookingTimerServiceUpdate,
  durationFromSnapshot,
  hasActiveCookingState,
  hasCookingModeActive,
  hasNonZeroSnapshotNumber,
  homeKitTemperatureFromSnapshot,
  isEnabledStatus,
  isCooktopActive,
  isFahrenheitValue,
  isFahrenheitUnit,
  isInitialCookingState,
  microwaveRemoteStartCommand,
  microwaveTimerCommand,
  microwaveVentLampCommand,
  microwavePowerPercent,
  ovenRemoteStartCommand,
  ovenTimerCommand,
  prepareMicrowaveCookCommand,
  prepareOvenCookCommand,
  snapshotIncludes,
  temperatureDisplayUnitsValue,
} from './cooking.js';

describe('cooking helpers', () => {
  test('builds durations from hour, minute, and second snapshot fields', () => {
    expect(durationFromSnapshot({
      hour: '1',
      minute: 2,
      second: '3',
    }, 'hour', 'minute', 'second')).toBe(3723);
  });

  test('uses zero for missing or invalid duration parts', () => {
    expect(durationFromSnapshot({
      hour: 'bad',
      second: 30,
    }, 'hour', 'minute', 'second')).toBe(30);
    expect(durationFromSnapshot(undefined, 'hour', 'minute', 'second')).toBe(0);
  });

  test('builds cooktop operation durations from matching cooktop fields', () => {
    expect(cooktopOperationDuration({
      cooktop2OperationTimeHour: 1,
      cooktop2OperationTimeMinute: 2,
      cooktop2OperationTimeSecond: 3,
      cooktop1OperationTimeMinute: 59,
      cooktop1OperationTimeSecond: 59,
    }, 2)).toBe(3723);
  });

  test('detects Fahrenheit temperature units safely', () => {
    expect(isFahrenheitValue('FAHRENHEIT')).toBe(true);
    expect(isFahrenheitValue('CELSIUS')).toBe(false);
    expect(isFahrenheitValue(undefined)).toBe(false);
    expect(isFahrenheitUnit({ unit: 'FAH' }, 'unit')).toBe(true);
    expect(isFahrenheitUnit({ unit: 'CEL' }, 'unit')).toBe(false);
    expect(isFahrenheitUnit(undefined, 'unit')).toBe(false);
  });

  test('returns HomeKit temperature display unit values', () => {
    expect(temperatureDisplayUnitsValue({ unit: 'FAH' }, 'unit')).toBe(1);
    expect(temperatureDisplayUnitsValue({ unit: 'CEL' }, 'unit')).toBe(0);
  });

  test('checks snapshot strings without throwing on missing data', () => {
    expect(snapshotIncludes({ state: 'COOKING_IN_PROGRESS' }, 'state', 'COOK')).toBe(true);
    expect(snapshotIncludes(undefined, 'state', 'COOK')).toBe(false);
  });

  test('normalizes enable/disable style cooking status fields', () => {
    expect(isEnabledStatus({ remoteStart: 'ENABLE' }, 'remoteStart')).toBe(true);
    expect(isEnabledStatus({ remoteStart: 'DISABLE' }, 'remoteStart')).toBe(false);
    expect(isEnabledStatus(undefined, 'remoteStart')).toBe(false);
  });

  test('detects active cooking states and modes safely', () => {
    expect(isInitialCookingState({ state: 'INITIAL' }, 'state')).toBe(true);
    expect(hasActiveCookingState({ state: 'COOKING_IN_PROGRESS' }, 'state')).toBe(true);
    expect(hasActiveCookingState(undefined, 'state')).toBe(false);
    expect(hasCookingModeActive({ mode: 'BAKE' }, 'mode', 'NONE')).toBe(true);
    expect(hasCookingModeActive({ mode: 'NONE' }, 'mode', 'NONE')).toBe(false);
    expect(hasCookingModeActive(undefined, 'mode', 'NONE')).toBe(false);
  });

  test('detects non-zero snapshot numbers safely', () => {
    expect(hasNonZeroSnapshotNumber({ burnerOnCounter: '2' }, 'burnerOnCounter')).toBe(true);
    expect(hasNonZeroSnapshotNumber({ burnerOnCounter: 0 }, 'burnerOnCounter')).toBe(false);
    expect(hasNonZeroSnapshotNumber(undefined, 'burnerOnCounter')).toBe(false);
  });

  test('normalizes microwave power levels to HomeKit percentages', () => {
    expect(microwavePowerPercent({ power: '5' }, 'power')).toBe(50);
    expect(microwavePowerPercent({ power: 10 }, 'power')).toBe(100);
    expect(microwavePowerPercent(undefined, 'power')).toBe(0);
  });

  test('detects active cooktops safely', () => {
    expect(isCooktopActive({ cooktop1CooktopState: 'HEATING' }, 1)).toBe(true);
    expect(isCooktopActive({ cooktop1CooktopState: 'INIT' }, 1)).toBe(false);
    expect(isCooktopActive(undefined, 1)).toBe(false);
  });

  test('normalizes cooking temperatures for HomeKit', () => {
    expect(homeKitTemperatureFromSnapshot({ temp: 350, unit: 'FAH' }, 'temp', 'unit')).toBeCloseTo(176.7);
    expect(homeKitTemperatureFromSnapshot({ temp: 21.26, unit: 'CEL' }, 'temp', 'unit')).toBe(21.5);
    expect(homeKitTemperatureFromSnapshot({ temp: 0, unit: 'CEL' }, 'temp', 'unit')).toBeUndefined();
  });

  test('clamps cooking temperatures by selected unit', () => {
    expect(clampCookingTemperature(200, 'FAHRENHEIT', [250, 450], [125, 230])).toBe(250);
    expect(clampCookingTemperature(500, 'FAHRENHEIT', [250, 450], [125, 230])).toBe(450);
    expect(clampCookingTemperature(20, 'CELSIUS', [100, 205], [38, 96])).toBe(38);
    expect(clampCookingTemperature(120, 'CELSIUS', [100, 205], [38, 96])).toBe(96);
  });

  test('maps cooking timer valve service updates', () => {
    const inUse = {
      IN_USE: 1,
      NOT_IN_USE: 0,
    };

    expect(cookingTimerServiceUpdate(1800, 3600, true, inUse)).toEqual({
      active: 1,
      inUse: 1,
      remainingDuration: 1800,
      setDuration: 3600,
    });
    expect(cookingTimerServiceUpdate(0, 0, true, inUse)).toEqual({
      active: 0,
      inUse: 0,
      remainingDuration: 0,
      setDuration: 0,
    });
    expect(cookingTimerServiceUpdate(1800, 3600, false, inUse).inUse).toBe(0);
  });

  test('maps cooking alarm valve service updates', () => {
    const inUse = {
      IN_USE: 1,
      NOT_IN_USE: 0,
    };

    expect(cookingAlarmServiceUpdate(90, inUse)).toEqual({
      active: 1,
      inUse: 1,
      remainingDuration: 90,
    });
    expect(cookingAlarmServiceUpdate(0, inUse)).toEqual({
      active: 0,
      inUse: 0,
      remainingDuration: 0,
    });
  });

  test('builds cooking timer commands for oven and microwave timing rules', () => {
    expect(ovenTimerCommand(3723)).toEqual({
      payload: {
        dataKey: null,
        dataValue: null,
        dataSetList: {
          ovenState: {
            cmdOptionContentsType: 'TIMER',
            cmdOptionDataLength: 'TIMER',
            lowerTimerHour: 128,
            lowerTimerMinute: 128,
            lowerTimerSecond: 128,
            upperTimerHour: 1,
            upperTimerMinute: 2,
            upperTimerSecond: 3,
          },
        },
        dataGetList: null,
      },
      command: 'Set',
      ctrlKey: 'SetTimer',
    });

    expect(microwaveTimerCommand(3723).payload.dataSetList.ovenState).toEqual({
      cmdOptionContentsType: 'TIMER',
      cmdOptionDataLength: 'TIMER',
      lowerTimerHour: 128,
      lowerTimerMinute: 128,
      lowerTimerSecond: 128,
      upperTimerHour: 0,
      upperTimerMinute: 62,
      upperTimerSecond: 3,
    });
  });

  test('builds common cooking stop commands', () => {
    expect(cookingStopCommand()).toEqual({
      payload: {
        dataKey: null,
        dataValue: null,
        dataSetList: {
          ovenState: {
            cmdOptionCookStop: 'UPPER',
          },
        },
        dataGetList: null,
      },
      command: 'Set',
      ctrlKey: 'SetCookStop',
    });
  });

  test('normalizes oven remote cook commands before payload creation', () => {
    expect(prepareOvenCookCommand({
      ovenMode: 'NONE',
      ovenSetTemperature: 100,
      tempUnits: 'FAHRENHEIT',
      ovenSetDuration: 0,
      probeTemperature: 10,
      ovenKeepWarm: 'ENABLE',
    })).toEqual({
      ovenMode: 'BAKE',
      ovenSetTemperature: 170,
      tempUnits: 'FAHRENHEIT',
      ovenSetDuration: 1800,
      probeTemperature: 10,
      ovenKeepWarm: 'ENABLE',
    });

    expect(prepareOvenCookCommand({
      ovenMode: 'CONVECTION_BAKE',
      ovenSetTemperature: 100,
      tempUnits: 'FAHRENHEIT',
      ovenSetDuration: 1200,
      probeTemperature: 0,
      ovenKeepWarm: 'DISABLE',
    }).ovenSetTemperature).toBe(300);

    expect(prepareOvenCookCommand({
      ovenMode: 'WARM',
      ovenSetTemperature: 350,
      tempUnits: 'CELSIUS',
      ovenSetDuration: 1200,
      probeTemperature: 20,
      ovenKeepWarm: 'ENABLE',
    })).toEqual({
      ovenMode: 'WARM',
      ovenSetTemperature: 0,
      tempUnits: 'CELSIUS',
      ovenSetDuration: 0,
      probeTemperature: 0,
      ovenKeepWarm: 'DISABLE',
    });
  });

  test('builds oven remote start command payloads', () => {
    expect(ovenRemoteStartCommand({
      ovenMode: 'BAKE',
      ovenSetTemperature: 350,
      tempUnits: 'FAHRENHEIT',
      ovenSetDuration: 3660,
      probeTemperature: 120,
      ovenKeepWarm: 'ENABLE',
    })).toEqual({
      payload: {
        dataKey: null,
        dataValue: null,
        dataSetList: {
          ovenState: {
            cmdOptionContentsType: 'REMOTE_COOK_START',
            cmdOptionDataLength: 'REMOTE_COOK_START',
            cmdOptionSetCookAndWarm: 'ENABLE',
            cmdOptionSetCookName: 'BAKE',
            cmdOptionSetMyRecipeCookNumber: 0,
            cmdOptionSetSteamLevel: '',
            cmdOptionSetSubCookNumber: 0,
            cmdOptionSetTargetTemperatureUnit: 'FAHRENHEIT',
            cmdOptionSetTargetTimeHour: 1,
            cmdOptionSetTargetTimeMinute: 1,
            cmdOptionSetRapidPreheat: 'OFF',
            setTargetProveTemperature: 120,
            setTargetTemperature: 350,
          },
        },
        dataGetList: null,
      },
      command: 'Set',
      ctrlKey: 'SetCookStart',
    });
  });

  test('builds microwave vent and lamp commands', () => {
    expect(microwaveVentLampCommand(2, 0)).toEqual({
      payload: {
        dataKey: null,
        dataValue: null,
        dataSetList: {
          ovenState: {
            cmdOptionContentsType: 'REMOTE_VENT_LAMP',
            cmdOptionDataLength: 'REMOTE_VENT_LAMP',
            mwoVentOnOff: 'ENABLE',
            mwoVentSpeedLevel: 2,
            mwoLampOnOff: 'DISABLE',
            mwoLampLevel: 0,
          },
        },
        dataGetList: null,
      },
      command: 'Set',
      ctrlKey: 'setVentLampLevel',
    });
  });

  test('normalizes microwave remote cook commands before payload creation', () => {
    expect(prepareMicrowaveCookCommand({
      ovenMode: 'COMBI_BAKE',
      ovenSetTemperature: 100,
      tempUnits: 'FAHRENHEIT',
      ovenSetDuration: 0,
      subCookNumber: 0,
      weightUnits: 'LBS',
      microwavePower: '100',
      targetWeight: 1,
    }, 50)).toEqual({
      ovenMode: 'COMBI_BAKE',
      ovenSetTemperature: 250,
      tempUnits: 'FAHRENHEIT',
      ovenSetDuration: 300,
      subCookNumber: 82,
      weightUnits: 'KG',
      microwavePower: '10',
      targetWeight: 0,
    });

    expect(prepareMicrowaveCookCommand({
      ovenMode: 'MICROWAVE',
      ovenSetTemperature: 350,
      tempUnits: 'FAHRENHEIT',
      ovenSetDuration: 120,
      subCookNumber: 5,
      weightUnits: 'LBS',
      microwavePower: '50',
      targetWeight: 1,
    }, 0)).toEqual({
      ovenMode: 'MICROWAVE',
      ovenSetTemperature: 0,
      tempUnits: 'FAHRENHEIT',
      ovenSetDuration: 120,
      subCookNumber: 0,
      weightUnits: 'LBS',
      microwavePower: '100',
      targetWeight: 0,
    });

    expect(prepareMicrowaveCookCommand({
      ovenMode: 'AIRFRY',
      ovenSetTemperature: 350,
      tempUnits: 'FAHRENHEIT',
      ovenSetDuration: 600,
      subCookNumber: 5,
      weightUnits: 'LBS',
      microwavePower: '50',
      targetWeight: 1,
    }, 50)).toEqual({
      ovenMode: 'AUTO_COOK',
      ovenSetTemperature: 0,
      tempUnits: 'FAHRENHEIT',
      ovenSetDuration: 0,
      subCookNumber: 0,
      weightUnits: 'LBS',
      microwavePower: '100',
      targetWeight: 0,
    });
  });

  test('builds microwave remote start command payloads', () => {
    expect(microwaveRemoteStartCommand({
      ovenMode: 'DEHYDRATE',
      ovenSetTemperature: 150,
      tempUnits: 'FAHRENHEIT',
      ovenSetDuration: 3661,
      subCookNumber: 0,
      weightUnits: 'LBS',
      microwavePower: '100',
      targetWeight: 0,
    }).payload.dataSetList.ovenState).toMatchObject({
      cmdOptionSetCookName: 'DEHYDRATE',
      cmdOptionSetTargetTimeHour: 1,
      cmdOptionSetTargetTimeMinute: 1,
      cmdOptionSetTargetTimeSecond: 1,
      setTargetTemp: 150,
    });

    expect(microwaveRemoteStartCommand({
      ovenMode: 'MICROWAVE',
      ovenSetTemperature: 0,
      tempUnits: 'FAHRENHEIT',
      ovenSetDuration: 3661,
      subCookNumber: 0,
      weightUnits: 'LBS',
      microwavePower: '100',
      targetWeight: 0,
    }).payload.dataSetList.ovenState).toMatchObject({
      cmdOptionSetCookName: 'MICROWAVE',
      cmdOptionSetTargetTimeHour: 0,
      cmdOptionSetTargetTimeMinute: 61,
      cmdOptionSetTargetTimeSecond: 1,
      setTargetTemp: 0,
    });
  });
});
