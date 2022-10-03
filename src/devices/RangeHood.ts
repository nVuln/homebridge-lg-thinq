import {baseDevice} from '../baseDevice';
import {LGThinQHomebridgePlatform} from '../platform';
import {Characteristic, CharacteristicValue, PlatformAccessory, Service} from 'homebridge';
import {Device} from "../lib/Device";
import {ValueType} from "../lib/DeviceModel";

export default class RangeHood extends baseDevice {
  protected serviceHood;
  protected serviceLight;

  constructor(
    protected readonly platform: LGThinQHomebridgePlatform,
    protected readonly accessory: PlatformAccessory,
  ) {
    super(platform, accessory);

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
      .onSet(this.setHoodActive.bind(this));
    this.serviceHood.getCharacteristic(Characteristic.RotationSpeed)
      .onSet(this.setHoodRotationSpeed.bind(this));

    const ventLevelSpec = device.deviceModel.value('hoodState.ventLevel');
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
      .onSet(this.setLightActive.bind(this));
    this.serviceLight.getCharacteristic(Characteristic.Brightness)
      .onSet(this.setLightBrightness.bind(this));

    const ventLightSpec = device.deviceModel.value('hoodState.lampLevel');
    if (ventLightSpec?.type === ValueType.Range) {
      this.serviceLight.getCharacteristic(Characteristic.Brightness)
        .setProps({
          minValue: ventLightSpec.min,
          maxValue: ventLightSpec.max,
          minStep: ventLightSpec.step,
        });
    }
  }

  async setHoodActive(value: CharacteristicValue) {
    await this.setHoodRotationSpeed(value ? 1 : 0);
  }

  async setHoodRotationSpeed(value: CharacteristicValue) {
    const device: Device = this.accessory.context.device;
    this.platform.ThinQ?.deviceControl(device, {
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
    await this.setLightBrightness(value? 1 : 0);
  }

  async setLightBrightness(value: CharacteristicValue) {
    const device: Device = this.accessory.context.device;
    this.platform.ThinQ?.deviceControl(device, {
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

  public update(snapshot) {
    super.update(snapshot);

    const hoodState = snapshot.hoodState;

    const {
      Characteristic,
    } = this.platform;

    this.serviceHood.updateCharacteristic(Characteristic.On, hoodState['ventLevel'] !== 0);
    this.serviceHood.updateCharacteristic(Characteristic.RotationSpeed, hoodState['ventLevel']);

    this.serviceLight.updateCharacteristic(Characteristic.On, hoodState['lampLevel'] !== 0);
    this.serviceLight.updateCharacteristic(Characteristic.Brightness, hoodState['lampLevel']);
  }
}
