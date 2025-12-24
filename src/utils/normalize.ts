export function normalizeBoolean(value: any): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value === 1;
  }
  if (typeof value === 'string') {
    const v = value.toLowerCase();
    return v === '1' || v === 'true' || v === 'on';
  }
  return !!value;
}

export function normalizeNumber(value: any): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'number') {
    return value;
  }
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

/**
 * Safely parse an integer value, returning a fallback if the value is NaN.
 */
export function safeParseInt(value: any, fallback = 0): number {
  const parsed = parseInt(value);
  return isNaN(parsed) ? fallback : parsed;
}

/**
 * Safely parse a float value, returning a fallback if the value is NaN.
 */
export function safeParseFloat(value: any, fallback = 0): number {
  const parsed = parseFloat(value);
  return isNaN(parsed) ? fallback : parsed;
}

/**
 * Convert hours, minutes, and optional seconds to total seconds.
 */
export function toSeconds(hours: number, minutes: number, seconds = 0): number {
  return hours * 3600 + minutes * 60 + seconds;
}

export default {
  normalizeBoolean,
  normalizeNumber,
  safeParseInt,
  safeParseFloat,
  toSeconds,
};
