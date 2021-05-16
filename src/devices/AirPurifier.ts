import {LGThinQHomebridgePlatform} from '../platform';
import {CharacteristicValue, PlatformAccessory, Service} from 'homebridge';
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
  protected serviceAirPurifier: Service;
  protected serviceAirQuanlity: Service;
  protected serviceLight: Service;

  constructor(
    protected readonly platform: LGThinQHomebridgePlatform,
    protected readonly accessory: PlatformAccessory,
  ) {
    super(platform, accessory);

    const {
      Service: {
        AirPurifier,
        AirQualitySensor,
        Lightbulb,
      },
      Characteristic,
    } = this.platform;

    const device: Device = accessory.context.device;

    // get the service if it exists, otherwise create a new service
    // you can create multiple services for each accessory
    this.serviceAirPurifier = accessory.getService(AirPurifier) || accessory.addService(AirPurifier, 'Air Purifier');

    /**
     * Required Characteristics: Active, CurrentAirPurifierState, TargetAirPurifierState
     */
    this.serviceAirPurifier.getCharacteristic(Characteristic.Active)
      .onGet(() => {
        return this.Status.isPowerOn ? Characteristic.Active.ACTIVE : Characteristic.Active.INACTIVE;
      })
      .onSet(this.setActive.bind(this));

    this.serviceAirPurifier.getCharacteristic(Characteristic.TargetAirPurifierState)
      .onGet(() => {
        return Characteristic.TargetAirPurifierState.AUTO;
      })
      .onSet(this.setTargetAirPurifierState.bind(this));

    /**
     * Optional Characteristics: Name, RotationSpeed, SwingMode
     */
    this.serviceAirPurifier.setCharacteristic(Characteristic.Name, device.name);
    this.serviceAirPurifier.getCharacteristic(Characteristic.SwingMode).onSet(this.setSwingMode.bind(this));
    this.serviceAirPurifier.getCharacteristic(Characteristic.RotationSpeed)
      .onSet(this.setRotationSpeed.bind(this))
      .setProps({
        minValue: 0,
        maxValue: Object.values(RotateSpeed).length - 1,
        minStep: 1,
      });

    this.serviceAirQuanlity = accessory.getService(AirQualitySensor) || accessory.addService(AirQualitySensor);
    this.serviceAirQuanlity.setCharacteristic(Characteristic.AirQuality, parseInt(device.data.snapshot['airState.quality.overall']));
    this.serviceAirQuanlity.setCharacteristic(Characteristic.PM2_5Density, parseInt(device.data.snapshot['airState.quality.PM2']) || 0);
    this.serviceAirQuanlity.setCharacteristic(Characteristic.PM10Density, parseInt(device.data.snapshot['airState.quality.PM10']) || 0);

    this.serviceLight = new Lightbulb('Light');
    this.serviceLight.getCharacteristic(Characteristic.On).onSet(this.setLight.bind(this));
    this.serviceLight.addLinkedService(this.serviceAirPurifier);

    this.updateAccessoryCharacteristic(device);
  }

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
    const values = Object.values(RotateSpeed);
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
      Characteristic,
    } = this.platform;

    this.serviceAirPurifier.updateCharacteristic(Characteristic.Active, this.Status.isPowerOn ? 1 : 0);
    this.serviceAirPurifier.updateCharacteristic(Characteristic.CurrentAirPurifierState, this.Status.isPowerOn ? 2 : 0);

    const rotateSpeed = Object.values(RotateSpeed).indexOf(this.Status.windStrength || RotateSpeed.AUTO);
    this.serviceAirPurifier.updateCharacteristic(Characteristic.RotationSpeed, rotateSpeed);

    this.serviceAirPurifier.updateCharacteristic(Characteristic.SwingMode, this.Status.isSwing ? 1 : 0);

    this.serviceAirQuanlity.updateCharacteristic(Characteristic.AirQuality, this.Status.airQuality.overall);
    this.serviceAirQuanlity.updateCharacteristic(Characteristic.PM2_5Density, this.Status.airQuality.PM2);
    this.serviceAirQuanlity.updateCharacteristic(Characteristic.PM10Density, this.Status.airQuality.PM10);

    this.serviceLight.updateCharacteristic(Characteristic.On, this.Status.isLightOn);
    this.serviceLight.setHiddenService(!this.Status.isPowerOn);
  }

  public get Status() {
    return new AirPurifierStatus(this.accessory.context.device.snapshot);
  }
}

export class AirPurifierStatus {
  constructor(protected data) {}

  public get isPowerOn() {
    return this.data['airState.operation'] as boolean;
  }

  public get isLightOn() {
    return this.isPowerOn && this.data['airState.lightingState.signal'] as boolean;
  }

  public get isSwing() {
    return (this.data['airState.circulate.rotate'] || 0) as boolean;
  }

  public get windStrength() {
    return this.data['airState.windStrength'];
  }

  public get airQuality() {
    return {
      overall: parseInt(this.data['airState.quality.overall']),
      PM2: parseInt(this.data['airState.quality.PM2'] || 0),
      PM10: parseInt(this.data['airState.quality.PM10'] || 0),
    };
  }
}
