import AirPurifier from './AirPurifier.js';
import { LGThinQHomebridgePlatform } from '../platform.js';
import { CharacteristicValue, Logger, PlatformAccessory } from 'homebridge';
import { Device } from '../lib/Device.js';
import { AccessoryContext } from '../baseDevice.js';
import {
  hasSnapshotKey,
  snapshotBoolean,
  snapshotNumber,
  updateCharacteristicIfChanged,
} from './helpers.js';

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
    await this.platform.ThinQ?.deviceControl(device.id, {
      dataKey: 'airState.lightingState.displayControl',
      dataValue: isLightOn,
    });
    device.data.snapshot['airState.lightingState.displayControl'] = isLightOn;
    this.updateAccessoryCharacteristic(device);
  }

  protected async setUVMode(value: CharacteristicValue) {
    const uvModeValue = value ? 1 : 0;
    await this.platform.ThinQ?.deviceControl(this.accessory.context.device, {
      dataKey: 'airState.miscFuncState.Uvnano',
      dataValue: uvModeValue,
    });
    this.accessory.context.device.data.snapshot['airState.miscFuncState.Uvnano'] = uvModeValue;
    this.updateAccessoryCharacteristic(this.accessory.context.device);
  }

  protected async setLightBrightness(value: CharacteristicValue) {
    const brightnessValue = (value as number) - 1;
    const values = [LightBrightness.LEVEL_1, LightBrightness.LEVEL_2, LightBrightness.LEVEL_3];

    if (typeof values[brightnessValue] !== 'undefined') {
      await this.platform.ThinQ?.deviceControl(this.accessory.context.device, {
        dataKey: 'airState.lightingState.displayControl',
        dataValue: values[brightnessValue],
      });
      this.accessory.context.device.data.snapshot['airState.lightingState.displayControl'] = values[brightnessValue];
      this.updateAccessoryCharacteristic(this.accessory.context.device);
    }
  }

  public updateAccessoryCharacteristic(device: Device) {
    super.updateAccessoryCharacteristic(device);

    const {
      Characteristic,
    } = this.platform;

    const snapshot = device.data.snapshot ?? {};

    // light brightness
    const values = [LightBrightness.LEVEL_1, LightBrightness.LEVEL_2, LightBrightness.LEVEL_3];
    const brightnessValue = values.indexOf(snapshotNumber(snapshot, 'airState.lightingState.displayControl'));
    if (brightnessValue !== -1) {
      updateCharacteristicIfChanged(this.serviceLight, Characteristic.Brightness, brightnessValue + 1);
    }

    if (hasSnapshotKey(snapshot, 'airState.tempState.current')) {
      updateCharacteristicIfChanged(
        this.serviceTemperatureSensor,
        Characteristic.CurrentTemperature,
        snapshotNumber(snapshot, 'airState.tempState.current'),
      );
    }

    if (hasSnapshotKey(snapshot, 'airState.humidity.current')) {
      updateCharacteristicIfChanged(
        this.serviceHumiditySensor,
        Characteristic.CurrentRelativeHumidity,
        snapshotNumber(snapshot, 'airState.humidity.current'),
      );
    }

    // uv mode
    updateCharacteristicIfChanged(this.serviceUVNano, Characteristic.On, snapshotBoolean(snapshot, 'airState.miscFuncState.Uvnano'));
  }
}
