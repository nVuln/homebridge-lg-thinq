import { fToC } from '../utils/temperature.js';
import { snapshotNumber, snapshotString } from './helpers.js';

type Snapshot = Record<string, unknown> | null | undefined;
type TemperatureRange = readonly [min: number, max: number];

export type CookingCommandPayload = {
  dataKey: null;
  dataValue: null;
  dataSetList: {
    ovenState: Record<string, unknown>;
  };
  dataGetList: null;
};

export type CookingDeviceCommand = {
  payload: CookingCommandPayload;
  command: 'Set';
  ctrlKey: string;
};

export type OvenCookCommandState = {
  ovenMode: string;
  ovenSetTemperature: number;
  tempUnits: string;
  ovenSetDuration: number;
  probeTemperature: number;
  ovenKeepWarm: string;
};

export type MicrowaveCookCommandState = {
  ovenMode: string;
  ovenSetTemperature: number;
  tempUnits: string;
  ovenSetDuration: number;
  subCookNumber: number;
  weightUnits: string;
  microwavePower: string;
  targetWeight: number;
};

export type CookingValveInUseValues = {
  IN_USE: number;
  NOT_IN_USE: number;
};

export type CookingTimerServiceUpdate = {
  active: number;
  inUse: number;
  remainingDuration: number;
  setDuration: number;
};

export type CookingAlarmServiceUpdate = {
  active: number;
  inUse: number;
  remainingDuration: number;
};

export function durationFromSnapshot(
  snapshot: Snapshot,
  hourKey: string,
  minuteKey: string,
  secondKey: string,
): number {
  return snapshotNumber(snapshot, hourKey) * 3600
    + snapshotNumber(snapshot, minuteKey) * 60
    + snapshotNumber(snapshot, secondKey);
}

export function cooktopOperationDuration(snapshot: Snapshot, cooktopNumber: number): number {
  const prefix = `cooktop${cooktopNumber}`;
  return durationFromSnapshot(
    snapshot,
    `${prefix}OperationTimeHour`,
    `${prefix}OperationTimeMinute`,
    `${prefix}OperationTimeSecond`,
  );
}

export function isFahrenheitValue(value: unknown): boolean {
  return typeof value === 'string' && value.includes('FAH');
}

export function isFahrenheitUnit(snapshot: Snapshot, unitKey: string): boolean {
  return isFahrenheitValue(snapshotString(snapshot, unitKey));
}

export function temperatureDisplayUnitsValue(snapshot: Snapshot, unitKey: string): 0 | 1 {
  return isFahrenheitUnit(snapshot, unitKey) ? 1 : 0;
}

export function snapshotIncludes(snapshot: Snapshot, key: string, expected: string): boolean {
  return snapshotString(snapshot, key).includes(expected);
}

export function isEnabledStatus(snapshot: Snapshot, key: string): boolean {
  const status = snapshotString(snapshot, key);
  return status !== '' && !status.includes('DIS');
}

export function isInitialCookingState(snapshot: Snapshot, stateKey: string): boolean {
  return snapshotIncludes(snapshot, stateKey, 'INITIAL');
}

export function hasActiveCookingState(snapshot: Snapshot, stateKey: string): boolean {
  const state = snapshotString(snapshot, stateKey);
  return state !== '' && !state.includes('INITIAL');
}

export function hasCookingModeActive(snapshot: Snapshot, modeKey: string, idleValue: string): boolean {
  const mode = snapshotString(snapshot, modeKey);
  return mode !== '' && !mode.includes(idleValue);
}

export function hasNonZeroSnapshotNumber(snapshot: Snapshot, key: string): boolean {
  return snapshotNumber(snapshot, key) !== 0;
}

export function microwavePowerPercent(snapshot: Snapshot, key = 'LWOMGTPowerLevel'): number {
  return snapshotNumber(snapshot, key) * 10;
}

export function isCooktopActive(snapshot: Snapshot, cooktopNumber: number): boolean {
  const state = snapshotString(snapshot, `cooktop${cooktopNumber}CooktopState`);
  return state !== '' && state !== 'INIT';
}

export function homeKitTemperatureFromSnapshot(
  snapshot: Snapshot,
  temperatureKey: string,
  unitKey: string,
): number | undefined {
  const temperature = snapshotNumber(snapshot, temperatureKey);
  if (temperature === 0) {
    return undefined;
  }

  if (isFahrenheitUnit(snapshot, unitKey)) {
    return fToC(temperature);
  }

  return 0.5 * Math.round(2 * temperature);
}

export function clampCookingTemperature(
  temperature: number,
  unit: unknown,
  fahrenheitRange: TemperatureRange,
  celsiusRange: TemperatureRange,
): number {
  const [min, max] = isFahrenheitValue(unit) ? fahrenheitRange : celsiusRange;
  return Math.min(max, Math.max(min, temperature));
}

export function cookingTimerServiceUpdate(
  remainingDuration: number,
  targetDuration: number,
  isCooking: boolean,
  inUse: CookingValveInUseValues,
): CookingTimerServiceUpdate {
  return {
    active: remainingDuration > 0 ? 1 : 0,
    inUse: targetDuration === 0 || !isCooking ? inUse.NOT_IN_USE : inUse.IN_USE,
    remainingDuration,
    setDuration: targetDuration,
  };
}

export function cookingAlarmServiceUpdate(
  timerDuration: number,
  inUse: CookingValveInUseValues,
): CookingAlarmServiceUpdate {
  return {
    active: timerDuration > 0 ? 1 : 0,
    inUse: timerDuration > 0 ? inUse.IN_USE : inUse.NOT_IN_USE,
    remainingDuration: timerDuration,
  };
}

function cookingTimerCommand(time: number, includeHours: boolean): CookingDeviceCommand {
  return {
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
          upperTimerHour: includeHours ? Math.floor(time / 3600) : 0,
          upperTimerMinute: includeHours ? Math.floor(time % 3600 / 60) : Math.floor(time / 60),
          upperTimerSecond: Math.floor(time % 60),
        },
      },
      dataGetList: null,
    },
    command: 'Set',
    ctrlKey: 'SetTimer',
  };
}

export function ovenTimerCommand(time: number): CookingDeviceCommand {
  return cookingTimerCommand(time, true);
}

export function microwaveTimerCommand(time: number): CookingDeviceCommand {
  return cookingTimerCommand(time, false);
}

export function cookingStopCommand(): CookingDeviceCommand {
  return {
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
  };
}

export function prepareOvenCookCommand(command: OvenCookCommandState): OvenCookCommandState {
  let next: OvenCookCommandState = {
    ...command,
  };

  if (next.ovenSetDuration === 0) {
    next.ovenSetDuration = 1800;
  }

  if (next.ovenMode === 'NONE') {
    next.ovenMode = 'BAKE';
  }

  if (next.ovenMode.includes('CONVECTION_BAKE') ||
    next.ovenMode.includes('CONVECTION_ROST') ||
    next.ovenMode.includes('FROZEN_MEAL') ||
    next.ovenMode.includes('AIR_FRY')) {
    next.ovenSetTemperature = clampCookingTemperature(
      next.ovenSetTemperature,
      next.tempUnits,
      [300, 550],
      [150, 285],
    );
  } else if (next.ovenMode.includes('BAKE')) {
    next.ovenSetTemperature = clampCookingTemperature(
      next.ovenSetTemperature,
      next.tempUnits,
      [170, 550],
      [80, 285],
    );
  } else if (next.ovenMode.includes('AIR_SOUSVIDE')) {
    next.ovenSetTemperature = clampCookingTemperature(
      next.ovenSetTemperature,
      next.tempUnits,
      [100, 205],
      [38, 96],
    );
  } else if (next.ovenMode.includes('WARM')) {
    next = {
      ovenMode: 'WARM',
      ovenSetTemperature: 0,
      tempUnits: isFahrenheitValue(next.tempUnits) ? 'FAHRENHEIT' : 'CELSIUS',
      ovenSetDuration: 0,
      probeTemperature: 0,
      ovenKeepWarm: 'DISABLE',
    };
  }

  return next;
}

export function ovenRemoteStartCommand(command: OvenCookCommandState): CookingDeviceCommand {
  return {
    payload: {
      dataKey: null,
      dataValue: null,
      dataSetList: {
        ovenState: {
          cmdOptionContentsType: 'REMOTE_COOK_START',
          cmdOptionDataLength: 'REMOTE_COOK_START',
          cmdOptionSetCookAndWarm: command.ovenKeepWarm,
          cmdOptionSetCookName: command.ovenMode,
          cmdOptionSetMyRecipeCookNumber: 0,
          cmdOptionSetSteamLevel: '',
          cmdOptionSetSubCookNumber: 0,
          cmdOptionSetTargetTemperatureUnit: command.tempUnits,
          cmdOptionSetTargetTimeHour: Math.floor(command.ovenSetDuration / 3600),
          cmdOptionSetTargetTimeMinute: Math.floor(command.ovenSetDuration % 3600 / 60),
          cmdOptionSetRapidPreheat: 'OFF',
          setTargetProveTemperature: command.probeTemperature,
          setTargetTemperature: command.ovenSetTemperature,
        },
      },
      dataGetList: null,
    },
    command: 'Set',
    ctrlKey: 'SetCookStart',
  };
}

export function microwaveVentLampCommand(ventSpeed: number, lampLevel: number): CookingDeviceCommand {
  return {
    payload: {
      dataKey: null,
      dataValue: null,
      dataSetList: {
        ovenState: {
          cmdOptionContentsType: 'REMOTE_VENT_LAMP',
          cmdOptionDataLength: 'REMOTE_VENT_LAMP',
          mwoVentOnOff: ventSpeed > 0 ? 'ENABLE' : 'DISABLE',
          mwoVentSpeedLevel: ventSpeed,
          mwoLampOnOff: lampLevel > 0 ? 'ENABLE' : 'DISABLE',
          mwoLampLevel: lampLevel,
        },
      },
      dataGetList: null,
    },
    command: 'Set',
    ctrlKey: 'setVentLampLevel',
  };
}

export function prepareMicrowaveCookCommand(
  command: MicrowaveCookCommandState,
  microwavePower: number,
): MicrowaveCookCommandState {
  let next: MicrowaveCookCommandState = {
    ...command,
    microwavePower: microwavePower.toString(),
  };

  if (next.ovenMode === 'NONE') {
    next.ovenMode = 'WARM';
  }

  if (next.ovenSetDuration === 0) {
    next.ovenSetDuration = 300;
  }

  const isBakeOrOven = next.ovenMode.includes('COMBI_BAKE')
    || next.ovenMode.includes('CONV_BAKE')
    || next.ovenMode.includes('COMBI_ROAST')
    || next.ovenMode.includes('OVEN');

  if (isBakeOrOven) {
    next.ovenSetTemperature = clampCookingTemperature(
      next.ovenSetTemperature,
      next.tempUnits,
      [250, 450],
      [125, 230],
    );

    if (next.ovenMode.includes('COMBI_BAKE')) {
      next.subCookNumber = 82;
      next.microwavePower = '10';
      next.targetWeight = 0;
      next.weightUnits = 'KG';
    }

    if (next.ovenMode.includes('COMBI_ROAST')) {
      next.subCookNumber = 82;
      next.microwavePower = '30';
      next.targetWeight = 0;
      next.weightUnits = 'LBS';
    }

    if (next.ovenMode.includes('CONV_BAKE') || next.ovenMode.includes('OVEN')) {
      next.subCookNumber = 0;
      next.microwavePower = '100';
      next.targetWeight = 0;
      next.weightUnits = 'LBS';
    }
  } else if (next.ovenMode.includes('DEHYDRATE')) {
    next.ovenSetTemperature = clampCookingTemperature(
      next.ovenSetTemperature,
      next.tempUnits,
      [100, 200],
      [38, 92],
    );
    next.subCookNumber = 0;
    next.microwavePower = '100';
    next.targetWeight = 0;
    next.weightUnits = 'LBS';
  } else if (next.ovenMode.includes('PROOF')) {
    next.subCookNumber = 0;
    next.microwavePower = '100';
    next.ovenSetTemperature = 0;
    next.targetWeight = 0;
    next.weightUnits = 'KG';
  } else if (next.ovenMode.includes('MICROWAVE')) {
    next.subCookNumber = 0;
    next.microwavePower = microwavePower === 0 ? '100' : microwavePower.toString();
    next.ovenSetTemperature = 0;
    next.targetWeight = 0;
  } else if (next.ovenMode.includes('AIRFRY')) {
    next.ovenMode = 'AUTO_COOK';
    next.subCookNumber = 0;
    next.ovenSetDuration = 0;
    next.microwavePower = '100';
    next.ovenSetTemperature = 0;
    next.targetWeight = 0;
  } else if (next.ovenMode.includes('INVERTER_DEFROST')) {
    next.subCookNumber = 211;
    next.ovenSetDuration = 0;
    next.microwavePower = 'NONE';
    next.ovenSetTemperature = 0;
    next.targetWeight = 300;
  } else if (next.ovenMode.includes('TIME_DEFROST')) {
    next.subCookNumber = 0;
    next.microwavePower = '100';
    next.ovenSetTemperature = 0;
    next.targetWeight = 0;
    next.weightUnits = 'KG';
  } else if (next.ovenMode.includes('WARM')) {
    next = {
      ovenMode: 'WARM',
      ovenSetTemperature: 0,
      tempUnits: next.tempUnits,
      ovenSetDuration: 0,
      subCookNumber: 0,
      weightUnits: 'KG',
      microwavePower: '100',
      targetWeight: 0,
    };
  }

  return next;
}

export function microwaveRemoteStartCommand(command: MicrowaveCookCommandState): CookingDeviceCommand {
  const usesHourDuration = command.ovenMode.includes('DEHYDRATE') || command.ovenMode.includes('PROOF');
  return {
    payload: {
      dataKey: null,
      dataValue: null,
      dataSetList: {
        ovenState: {
          cmdOptionContentsType: 'REMOTE_COOK_START',
          cmdOptionDataLength: 'REMOTE_COOK_START',
          cmdOptionSetCookName: command.ovenMode,
          cmdOptionSetReserved: 0,
          cmdOptionSetSubCookNumber: command.subCookNumber,
          cmdOptionSetTargetTemperatureUnit: command.tempUnits,
          cmdOptionSetTargetTimeHour: usesHourDuration ? Math.floor(command.ovenSetDuration / 3600) : 0,
          cmdOptionSetTargetTimeMinute: usesHourDuration
            ? Math.floor(command.ovenSetDuration % 3600 / 60)
            : Math.floor(command.ovenSetDuration / 60),
          cmdOptionSetTargetTimeSecond: Math.floor(command.ovenSetDuration % 60),
          cmdOptionSetWeightUnit: command.weightUnits,
          cmdOptionStep: 0,
          setMwoPowerLevel: command.microwavePower,
          setTargetSteamLevel: 'NONE',
          setTargetTemp: command.ovenSetTemperature,
          setTargetTempLevel: command.ovenMode === 'WARM' ? 'HIGH' : 0,
          setTargetWeight: command.targetWeight,
          setWarmType: 'NONE',
        },
      },
      dataGetList: null,
    },
    command: 'Set',
    ctrlKey: 'SetCookStart',
  };
}
