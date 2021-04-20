import {LGThinQHomebridgePlatform} from '../platform';
import {CharacteristicValue, PlatformAccessory} from 'homebridge';
import {Device} from '../lib/Device';
import {baseDevice} from '../baseDevice';

enum RotateSpeed {
  AUTO = 8,
  LOW = 2,
  MEDIUM = 4,
  HIGH = 6,
  EXTRA = 7,
}

export default class AirPurifier extends baseDevice {
  public intervalTime = 3000;
  constructor(
    protected readonly platform: LGThinQHomebridgePlatform,
    protected readonly accessory: PlatformAccessory,
  ) {
    super(platform, accessory);

    const {
      Service: {
        AirPurifier,
        AirQualitySensor,
        HumiditySensor,
        Lightbulb,
      },
      Characteristic,
    } = this.platform;

    const device: Device = accessory.context.device;

    // get the service if it exists, otherwise create a new service
    // you can create multiple services for each accessory
    const serviceAirPurifier = accessory.getService(AirPurifier) || accessory.addService(AirPurifier, 'Air Purifier');

    /**
     * Required Characteristics: Active, CurrentAirPurifierState, TargetAirPurifierState
     */
    serviceAirPurifier.getCharacteristic(Characteristic.Active)
      .onSet(this.setActive.bind(this));

    serviceAirPurifier.getCharacteristic(Characteristic.TargetAirPurifierState)
      .onGet(() => {
        return Characteristic.TargetAirPurifierState.AUTO;
      })
      .onSet(this.setTargetAirPurifierState.bind(this));

    /**
     * Optional Characteristics: Name, RotationSpeed, SwingMode
     */
    serviceAirPurifier.setCharacteristic(Characteristic.Name, device.name);
    serviceAirPurifier.getCharacteristic(Characteristic.SwingMode).onSet(this.setSwingMode.bind(this));

    const serviceHumiditySensor = accessory.getService(HumiditySensor) || accessory.addService(HumiditySensor);
    const humidityValue = device.data.snapshot['airState.humidity.current'] || 0;
    serviceHumiditySensor.setCharacteristic(Characteristic.CurrentRelativeHumidity, humidityValue);

    const serviceAirQuanlity = accessory.getService(AirQualitySensor) || accessory.addService(AirQualitySensor);
    serviceAirQuanlity.setCharacteristic(Characteristic.AirQuality, parseInt(device.data.snapshot['airState.quality.overall']));
    serviceAirQuanlity.setCharacteristic(Characteristic.PM2_5Density, parseInt(device.data.snapshot['airState.quality.PM2']) || 0);
    serviceAirQuanlity.setCharacteristic(Characteristic.PM10Density, parseInt(device.data.snapshot['airState.quality.PM10']) || 0);

    const serviceLight = accessory.getService(Lightbulb) || accessory.addService(Lightbulb, 'Light');
    serviceLight.getCharacteristic(Characteristic.On).onSet(this.setLight.bind(this));
    serviceAirPurifier.addLinkedService(serviceLight);

    this.updateAccessoryCharacteristic(device);
  }

  /**
   * Handle "SET" requests from HomeKit
   * These are sent when the user changes the state of an accessory, for example, turning on a Light bulb.
   */
  async setActive(value: CharacteristicValue) {
    const device: Device = this.accessory.context.device;
    const isOn = value as boolean ? 1 : 0;
    this.platform.ThinQ?.deviceControl(device.id, {
      dataKey: 'airState.operation',
      dataValue: isOn,
    });
  }

  async setTargetAirPurifierState(value: CharacteristicValue) {
    this.platform.log.debug('Set Target State ->', value);
  }

  async setRotationSpeed(value: CharacteristicValue) {
    this.platform.log.debug('Set Rotation Speed ->', value);
    const device: Device = this.accessory.context.device;
    const values = [RotateSpeed.AUTO, RotateSpeed.LOW, RotateSpeed.MEDIUM, RotateSpeed.HIGH, RotateSpeed.EXTRA];
    this.platform.ThinQ?.deviceControl(device.id, {
      dataKey: 'airState.windStrength',
      dataValue: values[value as number] || RotateSpeed.AUTO,
    });
  }

  async setSwingMode(value: CharacteristicValue) {
    const device: Device = this.accessory.context.device;
    const isSwing = value as boolean ? 1 : 0;
    this.platform.ThinQ?.deviceControl(device.id, {
      dataKey: 'airState.circulate.rotate',
      dataValue: isSwing,
    });
    device.data.snapshot['airState.circulate.rotate'] = isSwing;
    this.updateAccessoryCharacteristic(device);
  }

  async setLight(value: CharacteristicValue) {
    const device: Device = this.accessory.context.device;
    const isLightOn = value as boolean ? 1 : 0;
    this.platform.ThinQ?.deviceControl(device.id, {
      dataKey: 'airState.lightingState.signal',
      dataValue: isLightOn,
    });
    device.data.snapshot['airState.lightingState.signal'] = isLightOn;
    this.updateAccessoryCharacteristic(device);
  }

  public updateAccessoryCharacteristic(device: Device) {
    super.updateAccessoryCharacteristic(device);
    const {
      Service: {
        AirPurifier,
        AirQualitySensor,
        HumiditySensor,
        Lightbulb,
      },
      Characteristic,
    } = this.platform;

    const serviceAirPurifier = this.accessory.getService(AirPurifier);
    const active = device.data.snapshot['airState.operation'] as boolean;
    serviceAirPurifier?.updateCharacteristic(Characteristic.Active, active ? Characteristic.Active.ACTIVE : Characteristic.Active.INACTIVE);

    const currentState = active ? Characteristic.CurrentAirPurifierState.PURIFYING_AIR : Characteristic.CurrentAirPurifierState.INACTIVE;
    serviceAirPurifier?.updateCharacteristic(Characteristic.CurrentAirPurifierState, currentState);

    /*const values = [RotateSpeed.AUTO, RotateSpeed.LOW, RotateSpeed.MEDIUM, RotateSpeed.HIGH, RotateSpeed.EXTRA];
    const rotateSpeed = values.indexOf(device.data.snapshot['airState.windStrength'] || RotateSpeed.AUTO);
    serviceAirPurifier?.updateCharacteristic(Characteristic.RotationSpeed, rotateSpeed);*/

    const rotate = device.data.snapshot['airState.circulate.rotate'] || 0;
    const swingMode = rotate ? Characteristic.SwingMode.SWING_ENABLED : Characteristic.SwingMode.SWING_DISABLED;
    serviceAirPurifier?.updateCharacteristic(Characteristic.SwingMode, swingMode);

    const serviceAirQuanlity = this.accessory.getService(AirQualitySensor);
    serviceAirQuanlity?.updateCharacteristic(Characteristic.AirQuality, parseInt(device.data.snapshot['airState.quality.overall']));
    serviceAirQuanlity?.updateCharacteristic(Characteristic.PM2_5Density, parseInt(device.data.snapshot['airState.quality.PM2']) || 0);
    serviceAirQuanlity?.updateCharacteristic(Characteristic.PM10Density, parseInt(device.data.snapshot['airState.quality.PM10']) || 0);

    const serviceLight = this.accessory.getService(Lightbulb);
    serviceLight?.updateCharacteristic(Characteristic.On, !!device.data.snapshot['airState.lightingState.signal']);
    serviceLight?.setHiddenService(!active);

    const humidityValue = device.data.snapshot['airState.humidity.current'] || 0;
    const serviceHumiditySensor = this.accessory.getService(HumiditySensor);
    serviceHumiditySensor?.setCharacteristic(Characteristic.CurrentRelativeHumidity, humidityValue);
  }
}
