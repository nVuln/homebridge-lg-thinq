import { AccessoryContext, BaseDevice } from '../baseDevice.js';
import { LGThinQHomebridgePlatform } from '../platform.js';
import { CharacteristicValue, Logger, PlatformAccessory } from 'homebridge';
import { Device } from '../lib/Device.js';
import { type DeviceModel, ValueType } from '../lib/DeviceModel.js';
import { snapshotNumber, snapshotString, updateCharacteristicIfChanged } from './helpers.js';

export type RangeHoodModelLookup = Pick<DeviceModel, 'lookupMonitorName'>;

export type RangeHoodState = {
  isVentOn: boolean;
  ventLevel: number;
  isLampOn: boolean;
  lampLevel: number;
};

export function readRangeHoodState(snapshot: any, deviceModel: RangeHoodModelLookup): RangeHoodState {
  const hoodState = snapshot?.hoodState ?? {};
  const enabledVentState = deviceModel.lookupMonitorName('VentSet', '@CP_ENABLE_W');
  const enabledLampState = deviceModel.lookupMonitorName('LampSet', '@CP_ENABLE_W');

  return {
    isVentOn: snapshotString(hoodState, 'ventSet') === enabledVentState,
    ventLevel: snapshotNumber(hoodState, 'ventLevel'),
    isLampOn: snapshotString(hoodState, 'lampSet') === enabledLampState,
    lampLevel: snapshotNumber(hoodState, 'lampLevel'),
  };
}

export default class RangeHood extends BaseDevice {
  protected serviceHood;
  protected serviceLight;

  constructor(
    public readonly platform: LGThinQHomebridgePlatform,
    public readonly accessory: PlatformAccessory<AccessoryContext>,
    logger: Logger,
  ) {
    super(platform, accessory, logger);

    const device: Device = this.accessory.context.device;

    const {
      Service: {
        Fan,
        Lightbulb,
      },
      Characteristic,
    } = this.platform;

    this.serviceHood = accessory.getService(Fan) || accessory.addService(Fan, device.name);
    this.serviceHood.updateCharacteristic(Characteristic.Name, device.name);
    this.serviceHood.getCharacteristic(Characteristic.On)
      .onGet(this.onlineGet(() => readRangeHoodState(this.accessory.context.device.snapshot, this.accessory.context.device.deviceModel).isVentOn))
      .onSet(this.setHoodActive.bind(this));
    this.serviceHood.getCharacteristic(Characteristic.RotationSpeed)
      .onGet(this.onlineGet(() => readRangeHoodState(this.accessory.context.device.snapshot, this.accessory.context.device.deviceModel).ventLevel))
      .onSet(this.setHoodRotationSpeed.bind(this));

    const ventLevelSpec = device.deviceModel.value('VentLevel');
    if (ventLevelSpec?.type === ValueType.Range) {
      this.serviceHood.getCharacteristic(Characteristic.RotationSpeed)
        .setProps({
          minValue: ventLevelSpec.min,
          maxValue: ventLevelSpec.max,
          minStep: ventLevelSpec.step,
        });
    }

    // vent lamp
    this.serviceLight = accessory.getService(Lightbulb) || accessory.addService(Lightbulb, device.name + ' - Light');
    this.serviceLight.updateCharacteristic(Characteristic.Name, device.name + ' - Light');
    this.serviceLight.getCharacteristic(Characteristic.On)
      .onGet(this.onlineGet(() => readRangeHoodState(this.accessory.context.device.snapshot, this.accessory.context.device.deviceModel).isLampOn))
      .onSet(this.setLightActive.bind(this));
    this.serviceLight.getCharacteristic(Characteristic.Brightness)
      .onGet(this.onlineGet(() => readRangeHoodState(this.accessory.context.device.snapshot, this.accessory.context.device.deviceModel).lampLevel))
      .onSet(this.setLightBrightness.bind(this));

    const ventLightSpec = device.deviceModel.value('LampLevel');
    if (ventLightSpec?.type === ValueType.Range) {
      this.serviceLight.getCharacteristic(Characteristic.Brightness)
        .setProps({
          minValue: ventLightSpec.min,
          maxValue: ventLightSpec.max,
          minStep: ventLightSpec.step,
        });
    }

    this.updateAccessoryCharacteristic(device);
  }

  async setHoodActive(value: CharacteristicValue) {
    this.requireDeviceOnline();
    await this.setHoodRotationSpeed(value ? 1 : 0);
  }

  async setHoodRotationSpeed(value: CharacteristicValue) {
    this.requireDeviceOnline();
    const device: Device = this.accessory.context.device;
    await this.platform.ThinQ?.deviceControl(device, {
      dataKey: null,
      dataValue: null,
      dataSetList: {
        hoodState: {
          ventLevel: value,
        },
      },
      dataGetList: null,
    });
  }

  async setLightActive(value: CharacteristicValue) {
    this.requireDeviceOnline();
    await this.setLightBrightness(value? 1 : 0);
  }

  async setLightBrightness(value: CharacteristicValue) {
    this.requireDeviceOnline();
    const device: Device = this.accessory.context.device;
    await this.platform.ThinQ?.deviceControl(device, {
      dataKey: null,
      dataValue: null,
      dataSetList: {
        hoodState: {
          lampLevel: value,
        },
      },
      dataGetList: null,
    });
  }

  public updateAccessoryCharacteristic(device: Device) {
    super.updateAccessoryCharacteristic(device);

    const state = readRangeHoodState(device.snapshot, device.deviceModel);

    const {
      Characteristic,
    } = this.platform;

    updateCharacteristicIfChanged(this.serviceHood, Characteristic.On, state.isVentOn);
    updateCharacteristicIfChanged(this.serviceHood, Characteristic.RotationSpeed, state.ventLevel);

    updateCharacteristicIfChanged(this.serviceLight, Characteristic.On, state.isLampOn);
    updateCharacteristicIfChanged(this.serviceLight, Characteristic.Brightness, state.lampLevel);
  }
}
