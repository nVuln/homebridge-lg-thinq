import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { Logger, PlatformAccessory } from 'homebridge';
import Microwave from './Microwave.js';
import { MICROWAVE_SERVICES } from './microwaveServices.js';
import { AccessoryContext } from '../baseDevice.js';
import { LGThinQHomebridgePlatform } from '../platform.js';
import { Device, DeviceData } from '../lib/Device.js';
import { CHARACTERISTIC, createFakeAccessory, SERVICE } from './testSupport/fakeHap.js';

/**
 * The microwave publishes thirty-one services: a fan, a light, a power dimmer,
 * a Television with nine input sources, fourteen switches, two timer valves and
 * a thermostat. Home shows that as an Apple TV and lists it in the iPhone remote.
 * `microwave_services` lets the owner say which of them to show.
 */

const DEVICE_ID = '72cab768-be92-1f73-b459-805b651ff676';

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

function microwaveDevice(state = ovenState()) {
  const deviceData: DeviceData = {
    deviceId: DEVICE_ID,
    alias: 'Microwave',
    deviceType: 302,
    modelJsonUri: 'https://example.com/model.json',
    modelName: 'WMHES1738',
    snapshot: { online: true, ovenState: state },
    online: true,
  };
  return new Device(deviceData);
}

describe('Microwave service selection', () => {
  let logger: Logger;
  let updatePlatformAccessories: jest.Mock;
  let deviceControl: jest.Mock;
  let fake: ReturnType<typeof createFakeAccessory>;

  beforeEach(() => {
    jest.useFakeTimers();
    logger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as unknown as Logger;
    updatePlatformAccessories = jest.fn();
    deviceControl = jest.fn(() => new Promise<void>(() => undefined));
    fake = createFakeAccessory();
  });

  /** Builds the microwave on the shared fake accessory. Calling it twice
   * is a Homebridge restart: the second run finds what the first left behind. */
  function build(deviceConfig: Record<string, unknown> | null, device = microwaveDevice()) {
    const accessory = {
      context: { device },
      services: fake.serviceList,
      getService: fake.getService,
      getServiceById: fake.getServiceById,
      addService: fake.addService,
      removeService: fake.removeService,
    } as unknown as PlatformAccessory<AccessoryContext>;

    const platform = {
      Characteristic: CHARACTERISTIC,
      Service: SERVICE,
      log: logger,
      config: { devices: deviceConfig ? [{ id: DEVICE_ID, ...deviceConfig }] : [] },
      api: {
        updatePlatformAccessories,
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

    return new Microwave(platform, accessory, logger);
  }

  const subtypes = () => fake.serviceList.map(service => service.subtype).filter(Boolean) as string[];
  const published = (key: string) => MICROWAVE_SERVICES[key].every(subtype => subtypes().includes(subtype));
  const absent = (key: string) => MICROWAVE_SERVICES[key].every(subtype => !subtypes().includes(subtype));
  const publishedKeys = () => Object.keys(MICROWAVE_SERVICES).filter(published);

  it('names every service the microwave builds, and each only once', () => {
    build(null);

    const named = Object.values(MICROWAVE_SERVICES).flat();
    expect(new Set(named).size).toBe(named.length);
    expect(subtypes().sort()).toEqual([...named].sort());
    // plus the accessory information service, which has no subtype
    expect(fake.serviceList).toHaveLength(named.length + 1);
  });

  it('publishes everything by default, as it always has', () => {
    build(null);

    expect(publishedKeys()).toEqual(Object.keys(MICROWAVE_SERVICES));
    expect(fake.removeService).not.toHaveBeenCalled();
    expect(updatePlatformAccessories).not.toHaveBeenCalled();
  });

  it('publishes only the services that were chosen', () => {
    build({ microwave_services: ['fan', 'light'] });

    expect(publishedKeys()).toEqual(['fan', 'light']);
    expect(fake.serviceList.map(service => service.UUID)).toEqual(['AccessoryInformation', 'Fanv2', 'Lightbulb']);
  });

  it('lets any combination be chosen, including single cooking modes', () => {
    build({ microwave_services: ['fan', 'light', 'mode_air_fry', 'start', 'stop', 'timer'] });

    expect(publishedKeys()).toEqual(['fan', 'light', 'timer', 'start', 'stop', 'mode_air_fry']);
    expect(absent('mode_microwave')).toBe(true);
    expect(absent('television')).toBe(true);
  });

  it('can hide the fan and the light too', () => {
    build({ microwave_services: ['turn_off'] });

    expect(publishedKeys()).toEqual(['turn_off']);
  });

  it('shows nothing but the accessory information for an empty list', () => {
    build({ microwave_services: [] });

    expect(fake.serviceList.map(service => service.UUID)).toEqual(['AccessoryInformation']);
  });

  it('keeps the Television together with its nine input sources, or drops them together', () => {
    build({ microwave_services: ['television'] });
    expect(publishedKeys()).toEqual(['television']);
    expect(fake.serviceList.filter(service => service.UUID === 'InputSource')).toHaveLength(9);

    fake = createFakeAccessory();
    build({ microwave_services: ['fan'] });
    expect(fake.serviceList.filter(service => service.UUID === 'InputSource')).toHaveLength(0);
  });

  it('removes the services an earlier run left in the cache', () => {
    build(null);
    expect(fake.serviceList.length).toBeGreaterThan(30);

    build({ microwave_services: ['fan', 'light'] });

    expect(publishedKeys()).toEqual(['fan', 'light']);
  });

  it('keeps the cached fan and light themselves, not copies of them', () => {
    build(null);
    const fan = fake.services.get('Microwave Fan');
    const light = fake.services.get('Microwave Light');

    build({ microwave_services: ['fan', 'light'] });

    expect(fake.services.get('Microwave Fan')).toBe(fan);
    expect(fake.services.get('Microwave Light')).toBe(light);
  });

  it('saves the accessory once after removing services it already had', () => {
    build(null);

    build({ microwave_services: ['fan', 'light'] });

    expect(updatePlatformAccessories).toHaveBeenCalledTimes(1);
  });

  it('does not rewrite the cache when nothing that was already published had to go', () => {
    build({ microwave_services: ['fan', 'light'] });

    expect(updatePlatformAccessories).not.toHaveBeenCalled();
  });

  it('does not rewrite the cache on a later start with the same choice', () => {
    build({ microwave_services: ['fan', 'light'] });
    build({ microwave_services: ['fan', 'light'] });

    expect(publishedKeys()).toEqual(['fan', 'light']);
    expect(updatePlatformAccessories).not.toHaveBeenCalled();
  });

  it('publishes the services again when they are chosen again', () => {
    build({ microwave_services: ['fan', 'light'] });

    build({ microwave_services: ['fan', 'light', 'television', 'mode_defrost'] });

    expect(publishedKeys()).toEqual(['fan', 'light', 'television', 'mode_defrost']);
  });

  it('warns about names it does not know and ignores them', () => {
    build({ microwave_services: ['fan', 'popcorn', 7] });

    expect(publishedKeys()).toEqual(['fan']);
    const [message] = (logger.warn as jest.Mock).mock.calls[0] as [string];
    expect(message).toContain('popcorn');
    expect(message).toContain('7');
    expect(message).toContain('mode_air_fry');
  });

  it('warns and shows everything when the setting is not a list', () => {
    build({ microwave_services: 'fan' });

    expect(publishedKeys()).toEqual(Object.keys(MICROWAVE_SERVICES));
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  // Real HAP logs an error for each of these at every start when a thermostat
  // built just now keeps its default of 0 under the new ranges.
  it('starts the thermostat inside the temperature ranges it sets', () => {
    const thermostat = fake.addService(SERVICE.Thermostat, 'Microwave Oven Temperature Control', 'NicoCataGaTa-OvenTC');
    thermostat.getCharacteristic(CHARACTERISTIC.CurrentTemperature).value = 0;
    thermostat.getCharacteristic(CHARACTERISTIC.TargetTemperature).value = 10;

    build({ microwave_services: ['fan', 'light'] });

    expect(thermostat.getCharacteristic(CHARACTERISTIC.CurrentTemperature).value).toBe(10);
    expect(thermostat.getCharacteristic(CHARACTERISTIC.TargetTemperature).value).toBe(38);
  });

  it('still drives the fan when the other services are hidden', async () => {
    build({ microwave_services: ['fan', 'light'] });
    const hood = fake.services.get('Microwave Fan')!;

    await hood.getCharacteristic(CHARACTERISTIC.RotationSpeed).triggerSet(3);
    await jest.advanceTimersByTimeAsync(250);

    expect(deviceControl).toHaveBeenCalledTimes(1);
    const [, payload] = deviceControl.mock.calls[0] as [unknown, { dataSetList: { ovenState: Record<string, unknown> } }];
    expect(payload.dataSetList.ovenState.mwoVentSpeedLevel).toBe(3);
  });

  it('still shows the device state on the fan and the light when the other services are hidden', () => {
    const microwave = build({ microwave_services: ['fan', 'light'] });
    const light = fake.services.get('Microwave Light')!;
    const hood = fake.services.get('Microwave Fan')!;

    expect(() => microwave.updateAccessoryCharacteristic(microwaveDevice(ovenState({ mwoLampLevel: 2, mwoVentSpeedLevel: 3 })))).not.toThrow();

    expect(light.getCharacteristic(CHARACTERISTIC.On).value).toBe(true);
    expect(light.getCharacteristic(CHARACTERISTIC.Brightness).value).toBe(2);
    expect(hood.getCharacteristic(CHARACTERISTIC.Active).value).toBe(1);
    expect(hood.getCharacteristic(CHARACTERISTIC.RotationSpeed).value).toBe(3);
  });
});
