import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { Logger, PlatformAccessory } from 'homebridge';
import Microwave from './Microwave.js';
import { AccessoryContext } from '../baseDevice.js';
import { LGThinQHomebridgePlatform } from '../platform.js';
import { Device, DeviceData } from '../lib/Device.js';
import { createFakeAccessory, FakeService } from './testSupport/fakeHap.js';

/**
 * Regression tests for the microwave's combined vent+lamp command, each
 * named after a real failure observed testing against the physical device
 * (an LG WMHES1738), not a hypothetical. See the commit history on this
 * file's companion methods (sendLightVentCommand, enterVentLamp*,
 * exitVentLampCooldown, updateAccessoryCharacteristic) for the incidents.
 *
 * Characteristic references are plain strings (see CHARACTERISTIC below),
 * matched against FakeService's string-keyed lookup -- there is no real HAP
 * here, so this never talks to an actual Fanv2/Lightbulb service.
 */

const CHARACTERISTIC = {
  Active: 'Active',
  ActiveIdentifier: 'ActiveIdentifier',
  Brightness: 'Brightness',
  ConfiguredName: 'ConfiguredName',
  CurrentHeatingCoolingState: 'CurrentHeatingCoolingState',
  CurrentRelativeHumidity: 'CurrentRelativeHumidity',
  CurrentTemperature: 'CurrentTemperature',
  CurrentVisibilityState: { SHOWN: 'SHOWN', HIDDEN: 'HIDDEN' },
  Identifier: 'Identifier',
  InputSourceType: { APPLICATION: 'APPLICATION' },
  InUse: { IN_USE: 'IN_USE', NOT_IN_USE: 'NOT_IN_USE' },
  IsConfigured: { CONFIGURED: 'CONFIGURED' },
  Manufacturer: 'Manufacturer',
  Model: 'Model',
  Name: 'Name',
  On: 'On',
  RemainingDuration: 'RemainingDuration',
  RotationSpeed: 'RotationSpeed',
  SerialNumber: 'SerialNumber',
  SetDuration: 'SetDuration',
  SleepDiscoveryMode: { ALWAYS_DISCOVERABLE: 'ALWAYS_DISCOVERABLE' },
  StatusFault: 'StatusFault',
  TargetHeatingCoolingState: { OFF: 'OFF', HEAT: 'HEAT' },
  TargetTemperature: 'TargetTemperature',
  TargetVisibilityState: { SHOWN: 'SHOWN', HIDDEN: 'HIDDEN' },
  TemperatureDisplayUnits: 'TemperatureDisplayUnits',
  ValveType: { IRRIGATION: 'IRRIGATION' },
} as const;

const SERVICE = {
  AccessoryInformation: 'AccessoryInformation',
  Fanv2: 'Fanv2',
  InputSource: 'InputSource',
  Lightbulb: 'Lightbulb',
  Switch: 'Switch',
  Television: 'Television',
  Thermostat: 'Thermostat',
  Valve: 'Valve',
} as const;

/** A baseline snapshot shaped like the real ones captured from the device
 * tonight (trimmed to the fields this file actually reads). */
function ovenState(overrides: Record<string, unknown> = {}) {
  return {
    LWOState: 'INITIAL',
    LWOManualCookName: 'STANDBY',
    LWOTargetTemperatureUnit: 'FAHRENHEIT',
    LWORemainTimeHour: 0,
    LWORemainTimeMinute: 0,
    LWORemainTimeSecond: 0,
    LWOTimerHour: 0,
    LWOTimerMinute: 0,
    LWOTimerSecond: 0,
    LWOTargetTimeHour: 0,
    LWOTargetTimeMinute: 0,
    LWOTargetTimeSecond: 0,
    LWOMGTPowerLevel: '0',
    mwoVentSpeedLevel: 0,
    mwoLampLevel: 0,
    ...overrides,
  };
}

describe('Microwave vent/lamp command', () => {
  let logger: Logger;
  let platform: LGThinQHomebridgePlatform;
  let accessory: PlatformAccessory<AccessoryContext>;
  let deviceControl: jest.Mock;
  let hood: FakeService;
  let microwave: Microwave;

  /** Resolves the oldest still-pending deviceControl() call. Each call
   * simulates one HTTP round trip to LG's cloud completing. */
  let pendingResolvers: Array<() => void> = [];

  function resolveNextCommand() {
    const resolve = pendingResolvers.shift();
    if (!resolve) {
      throw new Error('No pending deviceControl() call to resolve');
    }
    resolve();
  }

  beforeEach(() => {
    jest.useFakeTimers();
    pendingResolvers = [];

    logger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as unknown as Logger;

    deviceControl = jest.fn(() => new Promise<void>((resolve) => {
      pendingResolvers.push(resolve);
    }));

    const deviceData: DeviceData = {
      deviceId: '72cab768-be92-1f73-b459-805b651ff676',
      alias: 'Microwave',
      deviceType: 302,
      modelJsonUri: 'https://example.com/model.json',
      modelName: 'WMHES1738',
      snapshot: { online: true, ovenState: ovenState() },
      online: true,
    };
    const device = new Device(deviceData);

    const { getService, addService, services } = createFakeAccessory();
    accessory = {
      context: { device },
      getService,
      addService,
    } as unknown as PlatformAccessory<AccessoryContext>;

    platform = {
      Characteristic: CHARACTERISTIC,
      Service: SERVICE,
      log: logger,
      config: { devices: [] },
      api: {
        hap: {
          HAPStatus: { SERVICE_COMMUNICATION_FAILURE: -70402 },
          HapStatusError: class HapStatusError extends Error {
            constructor(public status: number) {
              super(String(status));
            }
          },
        },
      },
      ThinQ: { deviceControl },
    } as unknown as LGThinQHomebridgePlatform;

    microwave = new Microwave(platform, accessory, logger);

    hood = services.get('Microwave Fan')!;
  });

  async function setRotationSpeed(value: number) {
    await hood.getCharacteristic(CHARACTERISTIC.RotationSpeed).triggerSet(value);
  }

  async function setActive(value: 0 | 1) {
    await hood.getCharacteristic(CHARACTERISTIC.Active).triggerSet(value);
  }

  /** Advances past the debounce and flushes microtasks, without resolving
   * the in-flight deviceControl() call. */
  async function advancePastDebounce() {
    await jest.advanceTimersByTimeAsync(250);
  }

  async function advancePastCooldown() {
    await jest.advanceTimersByTimeAsync(1000);
  }

  // Incident: fan changes required also toggling the light to take effect.
  // HomeKit writes Active and RotationSpeed as two separate characteristic
  // writes for one fan-tile gesture; without debouncing, each one fired its
  // own request and LG's API accepted only one (HTTP 400 on the other).
  it('coalesces Active+RotationSpeed writes for one gesture into a single request', async () => {
    await setRotationSpeed(3);
    await setActive(1);
    await advancePastDebounce();

    expect(deviceControl).toHaveBeenCalledTimes(1);
    const [, payload] = deviceControl.mock.calls[0] as [unknown, { dataSetList: { ovenState: Record<string, unknown> } }];
    expect(payload.dataSetList.ovenState.mwoVentSpeedLevel).toBe(3);
  });

  // Same incident, from the other direction: a second change should never
  // produce a second overlapping request while the first is still in flight.
  it('does not send a second overlapping request while one is in flight', async () => {
    await setRotationSpeed(3);
    await advancePastDebounce();
    expect(deviceControl).toHaveBeenCalledTimes(1);

    await setRotationSpeed(4);
    await advancePastDebounce();
    expect(deviceControl).toHaveBeenCalledTimes(1);

    resolveNextCommand();
    await advancePastCooldown();
    expect(deviceControl).toHaveBeenCalledTimes(2);
  });

  // Incident: requested speed 3 then 2 in quick succession; the eventual
  // dispatch sent "3", because RotationSpeed's destructive onGet overwrote
  // this.ventSpeed from the (stale) live snapshot before the queued change
  // could go out. Fixed by making onGet read-only.
  it('sends the latest requested value, not a stale one, when changed again before it is sent', async () => {
    await setRotationSpeed(3);
    await advancePastDebounce();
    expect(deviceControl).toHaveBeenCalledTimes(1);

    await setRotationSpeed(2);
    // A confirm read landing in the gap used to clobber the pending target.
    await hood.getCharacteristic(CHARACTERISTIC.RotationSpeed).triggerGet();

    resolveNextCommand();
    await advancePastCooldown();
    await advancePastDebounce();

    expect(deviceControl).toHaveBeenCalledTimes(2);
    const [, payload] = deviceControl.mock.calls[1] as [unknown, { dataSetList: { ovenState: Record<string, unknown> } }];
    expect(payload.dataSetList.ovenState.mwoVentSpeedLevel).toBe(2);
  });

  // Incident: the device's own periodic status push lags a just-sent change
  // by several seconds. The push-refresh used to force the display back to
  // the stale pre-change value on every single change until that later
  // snapshot corrected it -- not occasional, every time.
  it('does not push a stale snapshot value to Home while a command is pending', async () => {
    await setRotationSpeed(5);
    await advancePastDebounce();

    // A snapshot arrives mid-flight still reporting the old value.
    microwave.update({ ovenState: ovenState({ mwoVentSpeedLevel: 0 }) });

    expect(hood.getCharacteristic(CHARACTERISTIC.RotationSpeed).value).not.toBe(0);
  });

  // Incident: turning the fan on alone (no accompanying RotationSpeed
  // write) sent the Active characteristic's own 0|1 value as a literal
  // speed level -- requesting speed 3 could apply speed 1.
  it('does not send a bogus speed value when the fan is turned on via the power toggle alone', async () => {
    await setActive(1);
    await advancePastDebounce();

    expect(deviceControl).not.toHaveBeenCalled();
  });

  it('does send a real command when the fan is turned off via the power toggle', async () => {
    await setRotationSpeed(3);
    await advancePastDebounce();
    resolveNextCommand();
    await advancePastCooldown();
    deviceControl.mockClear();

    await setActive(0);
    await advancePastDebounce();

    expect(deviceControl).toHaveBeenCalledTimes(1);
    const [, payload] = deviceControl.mock.calls[0] as [unknown, { dataSetList: { ovenState: Record<string, unknown> } }];
    expect(payload.dataSetList.ovenState.mwoVentSpeedLevel).toBe(0);
  });

  // Incident: a change queued during Cooldown re-armed the same 250ms
  // debounce used for a brand new gesture, adding latency the old
  // retry-based version didn't always pay. By the time Cooldown ends, any
  // burst that arrived while busy has already settled into
  // this.ventSpeed/this.lampLevel -- nothing left to coalesce.
  it('replays a queued change immediately when Cooldown ends, without re-debouncing', async () => {
    await setRotationSpeed(3);
    await advancePastDebounce();
    resolveNextCommand();

    // Queue a second change while still inside the fixed Cooldown window.
    await jest.advanceTimersByTimeAsync(100);
    await setRotationSpeed(4);
    expect(deviceControl).toHaveBeenCalledTimes(1);

    // Cooldown's own timer firing should be sufficient; no extra 250ms.
    await jest.advanceTimersByTimeAsync(1000 - 100);
    expect(deviceControl).toHaveBeenCalledTimes(2);
  });
});
