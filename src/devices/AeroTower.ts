import AirPurifier from './AirPurifier';
import { LGThinQHomebridgePlatform } from '../platform';
import { CharacteristicValue, Logger, PlatformAccessory } from 'homebridge';
import { Device } from '../lib/Device';
import { AccessoryContext } from '../baseDevice';

export enum LightBrightness {
  OFF = 0,
  ON = 1,
  LEVEL_1 = 8,
  LEVEL_2 = 9,
  LEVEL_3 = 10,
}

export default class AeroTower extends AirPurifier {
  protected serviceTemperatureSensor;
  protected serviceHumiditySensor;
  protected serviceUVNano;

  constructor(
    public readonly platform: LGThinQHomebridgePlatform,
    public readonly accessory: PlatformAccessory<AccessoryContext>,
    logger: Logger,
  ) {
    super(platform, accessory, logger);

    const {
      Service: {
        TemperatureSensor,
        HumiditySensor,
        Switch,
      },
      Characteristic,
    } = this.platform;

    this.serviceTemperatureSensor = accessory.getService(TemperatureSensor)
      || accessory.addService(TemperatureSensor, 'Temperature Sensor');

    this.serviceHumiditySensor = accessory.getService(HumiditySensor)
      || accessory.addService(HumiditySensor, 'Humidity Sensor');

    this.serviceLight?.getCharacteristic(Characteristic.Brightness)
      .setProps({
        maxValue: 3, // 3 level of light
      })
      .onSet(this.setLightBrightness.bind(this));

    this.serviceUVNano = accessory.getService(Switch) || accessory.addService(Switch, 'UV Purifier');
    this.serviceUVNano.getCharacteristic(Characteristic.On).onSet(this.setUVMode.bind(this));
  }

  async setLight(value: CharacteristicValue) {
    if (!this.Status.isPowerOn) {
      return;
    }

    const device: Device = this.accessory.context.device;
    const isLightOn = value as boolean ? 1 : 0;
    this.platform.ThinQ?.deviceControl(device.id, {
      dataKey: 'airState.lightingState.displayControl',
      dataValue: isLightOn,
    }).then(() => {
      device.data.snapshot['airState.lightingState.displayControl'] = isLightOn;
      this.updateAccessoryCharacteristic(device);
    });
  }

  protected setUVMode(value: CharacteristicValue) {
    const uvModeValue = value ? 1 : 0;
    this.platform.ThinQ?.deviceControl(this.accessory.context.device, {
      dataKey: 'airState.miscFuncState.Uvnano',
      dataValue: uvModeValue,
    }).then(() => {
      this.accessory.context.device.data.snapshot['airState.miscFuncState.Uvnano'] = uvModeValue;
      this.updateAccessoryCharacteristic(this.accessory.context.device);
    });
  }

  protected setLightBrightness(value: CharacteristicValue) {
    const brightnessValue = (value as number) - 1;
    const values = [LightBrightness.LEVEL_1, LightBrightness.LEVEL_2, LightBrightness.LEVEL_3];

    if (typeof values[brightnessValue] !== 'undefined') {
      this.platform.ThinQ?.deviceControl(this.accessory.context.device, {
        dataKey: 'airState.lightingState.displayControl',
        dataValue: values[brightnessValue],
      }).then(() => {
        this.accessory.context.device.data.snapshot['airState.lightingState.displayControl'] = values[brightnessValue];
        this.updateAccessoryCharacteristic(this.accessory.context.device);
      });
    }
  }

  public updateAccessoryCharacteristic(device: Device) {
    super.updateAccessoryCharacteristic(device);

    const {
      Characteristic,
    } = this.platform;

    const snapshot = device.data.snapshot;

    // light brightness
    const values = [LightBrightness.LEVEL_1, LightBrightness.LEVEL_2, LightBrightness.LEVEL_3];
    const brightnessValue = values.indexOf(snapshot['airState.lightingState.displayControl'] || 0);
    if (brightnessValue !== -1) {
      this.serviceLight?.updateCharacteristic(Characteristic.Brightness, brightnessValue + 1);
    }

    if (typeof snapshot['airState.tempState.current'] !== 'undefined') {
      this.serviceTemperatureSensor.updateCharacteristic(Characteristic.CurrentTemperature, snapshot['airState.tempState.current']);
    }

    if (typeof snapshot['airState.humidity.current'] !== 'undefined') {
      this.serviceHumiditySensor.updateCharacteristic(Characteristic.CurrentRelativeHumidity, snapshot['airState.humidity.current']);
    }

    // uv mode
    this.serviceUVNano.updateCharacteristic(Characteristic.On, !!(snapshot['airState.miscFuncState.Uvnano'] || 0));
  }
}
