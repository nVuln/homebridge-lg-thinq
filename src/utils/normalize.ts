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

export default {
  normalizeBoolean,
  normalizeNumber,
};
