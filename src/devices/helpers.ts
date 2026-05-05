import type { CharacteristicValue, Service } from 'homebridge';

type CharacteristicReference = Parameters<Service['setCharacteristic']>[0];
type Snapshot = Record<string, unknown> | null | undefined;

export type ContactSensorStateValues = {
  CONTACT_DETECTED: number;
  CONTACT_NOT_DETECTED: number;
};

export type VisibilityStateValues = {
  SHOWN: number;
  HIDDEN: number;
};

export type VisibilityCharacteristicUpdate = {
  targetVisibilityState: number;
  currentVisibilityState: number;
};

export function hasSnapshotKey(snapshot: Snapshot, key: string): boolean {
  return snapshot !== null && snapshot !== undefined && key in snapshot;
}

export function contactSensorStateValue(isContactDetected: boolean, contactState: ContactSensorStateValues): number {
  return isContactDetected ? contactState.CONTACT_DETECTED : contactState.CONTACT_NOT_DETECTED;
}

export function visibilityCharacteristicUpdate(
  isShown: boolean,
  targetVisibilityState: VisibilityStateValues,
  currentVisibilityState: VisibilityStateValues,
): VisibilityCharacteristicUpdate {
  return {
    targetVisibilityState: isShown ? targetVisibilityState.SHOWN : targetVisibilityState.HIDDEN,
    currentVisibilityState: isShown ? currentVisibilityState.SHOWN : currentVisibilityState.HIDDEN,
  };
}

export function updateCharacteristicIfChanged(
  service: Service | undefined,
  characteristic: CharacteristicReference,
  value: CharacteristicValue | null,
): boolean {
  if (!service) {
    return false;
  }

  const currentValue = service.getCharacteristic(characteristic)?.value;
  if (currentValue === value) {
    return false;
  }

  service.updateCharacteristic(characteristic, value);
  return true;
}

export function updateCharacteristicIfDefined(
  service: Service | undefined,
  characteristic: CharacteristicReference,
  value: CharacteristicValue | null | undefined,
): boolean {
  if (value === undefined) {
    return false;
  }

  return updateCharacteristicIfChanged(service, characteristic, value);
}

export function snapshotNumber(snapshot: Snapshot, key: string, fallback = 0): number {
  const value = snapshot?.[key];
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : fallback;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
}

export function snapshotBoolean(snapshot: Snapshot, key: string, fallback = false): boolean {
  const value = snapshot?.[key];
  if (value === undefined || value === null) {
    return fallback;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'on', 'enable', 'enabled', 'ena'].includes(normalized)) {
      return true;
    }

    if (['0', 'false', 'off', 'disable', 'disabled', 'dis'].includes(normalized)) {
      return false;
    }
  }

  return Boolean(value);
}

export function snapshotString(snapshot: Snapshot, key: string, fallback = ''): string {
  const value = snapshot?.[key];
  return typeof value === 'string' ? value : fallback;
}
