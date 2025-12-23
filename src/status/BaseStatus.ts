import { DeviceModel } from '../lib/DeviceModel.js';
import { safeParseInt } from '../helper.js';

/**
 * Base class for device status implementations.
 * Provides common utility methods for parsing and accessing device data.
 */
export abstract class BaseStatus {
  constructor(
    protected readonly data: Record<string, unknown> | undefined,
    protected readonly deviceModel: DeviceModel,
  ) {}

  /**
   * Safely get an integer value from the data with a fallback.
   */
  protected getInt(key: string, fallback = 0): number {
    return safeParseInt(this.data?.[key], fallback);
  }

  /**
   * Safely get a string value from the data with a fallback.
   */
  protected getString(key: string, fallback = ''): string {
    const value = this.data?.[key];
    return typeof value === 'string' ? value : fallback;
  }

  /**
   * Safely get a boolean value from the data.
   */
  protected getBool(key: string): boolean {
    return !!this.data?.[key];
  }

  /**
   * Check if a key exists in the data.
   */
  protected has(key: string): boolean {
    return this.data !== undefined && key in this.data;
  }

  /**
   * Get the raw value for a key.
   */
  protected getRaw<T>(key: string): T | undefined {
    return this.data?.[key] as T | undefined;
  }
}

/**
 * Base class for appliance status (washer, dryer, styler, dishwasher).
 * Provides common time-related properties.
 */
export abstract class ApplianceStatus extends BaseStatus {
  /**
   * Get the remaining duration in seconds.
   */
  public get remainDuration(): number {
    const hours = this.getInt('remainTimeHour');
    const minutes = this.getInt('remainTimeMinute');
    return this.isRunning ? (hours * 3600 + minutes * 60) : 0;
  }

  /**
   * Check if the device is powered on.
   */
  public abstract get isPowerOn(): boolean;

  /**
   * Check if the device is actively running.
   */
  public abstract get isRunning(): boolean;
}
