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
    this.serviceAirPurifier.getCharacteristic(Characteristic.RotationSpeed).onSet(this.setRotationSpeed.bind(this));

    this.serviceAirQuanlity = accessory.getService(AirQualitySensor) || accessory.addService(AirQualitySensor);

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
      dataValue: isOn as number,
    });
  }

  async setTargetAirPurifierState(value: CharacteristicValue) {
    this.platform.log.debug('Set Target State ->', value);
  }

  async setRotationSpeed(value: CharacteristicValue) {
    if (!this.Status.isPowerOn) {
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.NOT_ALLOWED_IN_CURRENT_STATE);
    }

    this.platform.log.debug('Set Rotation Speed ->', value);
    const device: Device = this.accessory.context.device;
    const values = Object.values(RotateSpeed);
    this.platform.ThinQ?.deviceControl(device.id, {
      dataKey: 'airState.windStrength',
      dataValue: values[Math.floor((value as number) / 20)] || RotateSpeed.AUTO, // convert from percent to level, 100% = high, 0% = auto
    });
  }

  async setSwingMode(value: CharacteristicValue) {
    if (!this.Status.isPowerOn) {
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.NOT_ALLOWED_IN_CURRENT_STATE);
    }

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
    if (!this.Status.isPowerOn) {
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.NOT_ALLOWED_IN_CURRENT_STATE);
    }

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
    this.serviceAirPurifier.updateCharacteristic(Characteristic.SwingMode, this.Status.isSwing ? 1 : 0);

    this.serviceAirQuanlity.updateCharacteristic(Characteristic.AirQuality, this.Status.airQuality.overall);
    this.serviceAirQuanlity.updateCharacteristic(Characteristic.PM2_5Density, this.Status.airQuality.PM2);
    this.serviceAirQuanlity.updateCharacteristic(Characteristic.PM10Density, this.Status.airQuality.PM10);

    this.serviceLight.updateCharacteristic(Characteristic.On, this.Status.isLightOn);
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

  public get airQuality() {
    return {
      overall: parseInt(this.data['airState.quality.overall']),
      PM2: parseInt(this.data['airState.quality.PM2'] || '0'),
      PM10: parseInt(this.data['airState.quality.PM10'] || '0'),
    };
  }
}
