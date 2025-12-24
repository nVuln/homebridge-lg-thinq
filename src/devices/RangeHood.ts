import { AccessoryContext, BaseDevice } from '../baseDevice.js';
import { LGThinQHomebridgePlatform } from '../platform.js';
import { CharacteristicValue, Logger, PlatformAccessory, Service } from 'homebridge';
import { Device } from '../lib/Device.js';
import { ValueType } from '../lib/DeviceModel.js';

export default class RangeHood extends BaseDevice {
  protected serviceHood: Service;
  protected serviceLight: Service;

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

    this.serviceHood = this.getOrCreateService(Fan, device.name);
    this.serviceHood.getCharacteristic(Characteristic.On)
      .onSet(this.setHoodActive.bind(this));
    this.serviceHood.getCharacteristic(Characteristic.RotationSpeed)
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
    this.serviceLight = this.getOrCreateService(Lightbulb, device.name + ' - Light', 'Light');
    this.serviceLight.getCharacteristic(Characteristic.On)
      .onSet(this.setLightActive.bind(this));
    this.serviceLight.getCharacteristic(Characteristic.Brightness)
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
    await this.setHoodRotationSpeed(value ? 1 : 0);
  }

  async setHoodRotationSpeed(value: CharacteristicValue) {
    const device: Device = this.accessory.context.device;
    try {
      await this.platform.ThinQ?.deviceControl(device.id, {
        dataKey: null,
        dataValue: null,
        dataSetList: {
          hoodState: {
            ventLevel: value,
          },
        },
        dataGetList: null,
      });
    } catch (error) {
      this.logger.error('Failed to set hood rotation speed:', error);
    }
  }

  async setLightActive(value: CharacteristicValue) {
    await this.setLightBrightness(value ? 1 : 0);
  }

  async setLightBrightness(value: CharacteristicValue) {
    const device: Device = this.accessory.context.device;
    try {
      await this.platform.ThinQ?.deviceControl(device.id, {
        dataKey: null,
        dataValue: null,
        dataSetList: {
          hoodState: {
            lampLevel: value,
          },
        },
        dataGetList: null,
      });
    } catch (error) {
      this.logger.error('Failed to set light brightness:', error);
    }
  }

  public updateAccessoryCharacteristic(device: Device) {
    super.updateAccessoryCharacteristic(device);

    const hoodState = device.snapshot.hoodState;
    const isVentOn = hoodState.ventSet === device.deviceModel.lookupMonitorName('VentSet', '@CP_ENABLE_W');
    const isLampOn = hoodState.lampSet === device.deviceModel.lookupMonitorName('LampSet', '@CP_ENABLE_W');

    const {
      Characteristic,
    } = this.platform;

    this.serviceHood.updateCharacteristic(Characteristic.On, isVentOn);
    this.serviceHood.updateCharacteristic(Characteristic.RotationSpeed, hoodState.ventLevel);

    this.serviceLight.updateCharacteristic(Characteristic.On, isLampOn);
    this.serviceLight.updateCharacteristic(Characteristic.Brightness, hoodState.lampLevel);
  }
}
