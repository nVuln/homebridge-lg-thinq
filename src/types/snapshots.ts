/**
 * TypeScript interfaces for device snapshot data structures.
 * These interfaces provide type safety for device state data.
 */

/**
 * Common base interface for all device snapshots
 */
export interface BaseSnapshot {
  online?: boolean;
}

/**
 * Air Conditioner snapshot data
 */
export interface ACSnapshot extends BaseSnapshot {
  'airState.operation'?: number;
  'airState.opMode'?: number;
  'airState.tempState.current'?: number;
  'airState.tempState.target'?: number;
  'airState.windStrength'?: number;
  'airState.wDir.vStep'?: number;
  'airState.wDir.hStep'?: number;
  'airState.circulate.rotate'?: number;
  'airState.lightingState.signal'?: number;
  'airState.humidity.current'?: string | number;
  'airState.quality.overall'?: string | number;
  'airState.quality.PM2'?: string | number;
  'airState.quality.PM10'?: string | number;
  'airState.quality.sensorMon'?: number;
  'airState.wMode.jet'?: number;
  'airState.miscFuncState.airClean'?: number;
  'airState.energy.onCurrent'?: number;
  'airState.filterMngStates.useTime'?: number;
  'airState.filterMngStates.maxTime'?: number;
}

/**
 * Air Purifier snapshot data
 */
export interface AirPurifierSnapshot extends BaseSnapshot {
  'airState.operation'?: number | boolean;
  'airState.opMode'?: number;
  'airState.windStrength'?: number;
  'airState.circulate.rotate'?: number;
  'airState.lightingState.signal'?: number;
  'airState.quality.overall'?: string | number;
  'airState.quality.PM2'?: string | number;
  'airState.quality.PM10'?: string | number;
  'airState.quality.sensorMon'?: number;
  'airState.miscFuncState.airFast'?: number | boolean;
  'airState.filterMngStates.useTime'?: number;
  'airState.filterMngStates.maxTime'?: number;
}

/**
 * Dehumidifier snapshot data
 */
export interface DehumidifierSnapshot extends BaseSnapshot {
  'airState.operation'?: number;
  'airState.opMode'?: number;
  'airState.windStrength'?: number;
  'airState.humidity.current'?: number;
  'airState.humidity.desired'?: number;
  'airState.notificationExt'?: unknown;
}

/**
 * Washer/Dryer snapshot data
 */
export interface WasherDryerSnapshot extends BaseSnapshot {
  washerDryer?: {
    state?: string;
    preState?: string;
    processState?: string;
    remoteStart?: string;
    initialBit?: string;
    childLock?: string;
    TCLCount?: number;
    reserveTimeHour?: number;
    reserveTimeMinute?: number;
    remainTimeHour?: number;
    remainTimeMinute?: number;
    initialTimeHour?: number;
    initialTimeMinute?: number;
  };
}

/**
 * Refrigerator snapshot data
 */
export interface RefrigeratorSnapshot extends BaseSnapshot {
  refState?: {
    fridgeTemp?: number;
    freezerTemp?: number;
    atLeastOneDoorOpen?: string;
    tempUnit?: 'CELSIUS' | 'FAHRENHEIT';
    expressMode?: string;
    expressFridge?: string;
    ecoFriendly?: string;
    waterFilter?: string;
    waterFilter1RemainP?: number;
  };
}

/**
 * Styler snapshot data
 */
export interface StylerSnapshot extends BaseSnapshot {
  styler?: {
    state?: string;
    preState?: string;
    processState?: string;
    remainTimeHour?: number;
    remainTimeMinute?: number;
  };
}

/**
 * Range Hood snapshot data
 */
export interface RangeHoodSnapshot extends BaseSnapshot {
  hoodState?: {
    ventMode?: string;
    ventLevel?: number;
    lampLevel?: number;
    remainTimeMinute?: number;
    remainTimeSecond?: number;
    childLock?: string;
    standyMode?: string;
    hoodState?: string;
  };
}

/**
 * Dishwasher snapshot data
 */
export interface DishwasherSnapshot extends BaseSnapshot {
  dishwasher?: {
    state?: string;
    preState?: string;
    processState?: string;
    remainTimeHour?: number;
    remainTimeMinute?: number;
    tclCount?: number;
  };
}

/**
 * Union type for all device snapshots
 */
export type DeviceSnapshot =
  | ACSnapshot
  | AirPurifierSnapshot
  | DehumidifierSnapshot
  | WasherDryerSnapshot
  | RefrigeratorSnapshot
  | StylerSnapshot
  | RangeHoodSnapshot
  | DishwasherSnapshot;
