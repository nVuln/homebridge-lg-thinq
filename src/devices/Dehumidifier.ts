import { AccessoryContext, BaseDevice } from '../baseDevice';
import { LGThinQHomebridgePlatform } from '../platform';
import { CharacteristicValue, Logger, PlatformAccessory } from 'homebridge';
import { Device } from '../lib/Device';

enum RotateSpeed {
  LOW = 2,
  HIGH = 6,
}

export default class Dehumidifier extends BaseDevice {
  protected serviceDehumidifier;
  protected serviceHumiditySensor;
  constructor(
    public readonly platform: LGThinQHomebridgePlatform,
    public readonly accessory: PlatformAccessory<AccessoryContext>,
    logger: Logger,
  ) {
    super(platform, accessory, logger);

    const {
      Service: {
        HumidifierDehumidifier,
        HumiditySensor,
      },
      Characteristic,
      Characteristic: {
        CurrentHumidifierDehumidifierState,
      },
    } = this.platform;

    const device: Device = accessory.context.device;

    this.serviceDehumidifier = accessory.getService(HumidifierDehumidifier) || accessory.addService(HumidifierDehumidifier);
    this.serviceDehumidifier.setCharacteristic(Characteristic.Name, device.name);
    this.serviceDehumidifier.getCharacteristic(Characteristic.Active)
      .onSet(this.setActive.bind(this))
      .updateValue(Characteristic.Active.INACTIVE);
    this.serviceDehumidifier.getCharacteristic(Characteristic.CurrentHumidifierDehumidifierState)
      .setProps({
        validValues: [
          CurrentHumidifierDehumidifierState.INACTIVE,
          CurrentHumidifierDehumidifierState.IDLE,
          CurrentHumidifierDehumidifierState.DEHUMIDIFYING,
        ],
      })
      .updateValue(Characteristic.CurrentHumidifierDehumidifierState.INACTIVE);
    this.serviceDehumidifier.getCharacteristic(Characteristic.TargetHumidifierDehumidifierState)
      .setProps({
        validValues: [2],
      })
      .updateValue(Characteristic.TargetHumidifierDehumidifierState.DEHUMIDIFIER);

    this.serviceDehumidifier.getCharacteristic(Characteristic.RelativeHumidityDehumidifierThreshold)
      .onSet(this.setHumidityThreshold.bind(this))
      .setProps({
        minValue: 0,
        maxValue: 100,
        minStep: 1,
      });

    this.serviceDehumidifier.getCharacteristic(Characteristic.RotationSpeed)
      .onSet(this.setSpeed.bind(this))
      .setProps({
        minValue: 1,
        maxValue: Object.keys(RotateSpeed).length / 2,
        minStep: 1,
      });

    this.serviceHumiditySensor = accessory.getService(HumiditySensor) || accessory.addService(HumiditySensor);
    this.serviceHumiditySensor.addLinkedService(this.serviceDehumidifier);
  }

  async setActive(value: CharacteristicValue) {
    this.platform.log.debug('Set Dehumidifier Active State ->', value);
    const device: Device = this.accessory.context.device;
    const isOn = value as boolean;
    if (this.Status.isPowerOn && isOn) {
      return; // don't send same status
    }

    this.platform.ThinQ?.deviceControl(device.id, {
      dataKey: 'airState.operation',
      dataValue: isOn,
    }).then(() => {
      device.data.snapshot['airState.operation'] = isOn ? 1 : 0;
      this.updateAccessoryCharacteristic(device);
    });
  }

  async setHumidityThreshold(value: CharacteristicValue) {
    if (!this.Status.isPowerOn) {
      return;
    }

    const device: Device = this.accessory.context.device;
    this.platform.ThinQ?.deviceControl(device.id, {
      dataKey: 'airState.humidity.desired',
      dataValue: value as number,
    }).then(() => {
      device.data.snapshot['airState.humidity.desired'] = value;
      this.updateAccessoryCharacteristic(device);
    });
  }

  async setSpeed(value: CharacteristicValue) {
    if (!this.Status.isPowerOn) {
      return;
    }

    const device: Device = this.accessory.context.device;
    const values = Object.keys(RotateSpeed);
    const windStrength = parseInt(values[Math.round((value as number)) - 1]) || RotateSpeed.HIGH;
    this.platform.ThinQ?.deviceControl(device.id, {
      dataKey: 'airState.windStrength',
      dataValue: windStrength,
    });
    device.data.snapshot['airState.windStrength'] = windStrength;
    this.updateAccessoryCharacteristic(device);
  }

  public updateAccessoryCharacteristic(device: Device) {
    super.updateAccessoryCharacteristic(device);

    const {
      Characteristic,
      Characteristic: {
        CurrentHumidifierDehumidifierState: {
          INACTIVE,
          IDLE,
          DEHUMIDIFYING,
        },
      },
    } = this.platform;

    this.serviceDehumidifier.updateCharacteristic(Characteristic.Active, this.Status.isPowerOn ? 1 : 0);
    this.serviceDehumidifier.updateCharacteristic(Characteristic.CurrentRelativeHumidity, this.Status.humidityCurrent);
    this.serviceDehumidifier.updateCharacteristic(Characteristic.RelativeHumidityDehumidifierThreshold, this.Status.humidityTarget);
    const currentState = this.Status.isPowerOn ? (this.Status.isDehumidifying ? DEHUMIDIFYING : IDLE) : INACTIVE;
    this.serviceDehumidifier.updateCharacteristic(Characteristic.CurrentHumidifierDehumidifierState, currentState);
    this.serviceDehumidifier.updateCharacteristic(Characteristic.RotationSpeed, this.Status.rotationSpeed);
    this.serviceDehumidifier.updateCharacteristic(Characteristic.WaterLevel, this.Status.isWaterTankFull ? 100 : 0);

    this.serviceHumiditySensor.updateCharacteristic(Characteristic.CurrentRelativeHumidity, this.Status.humidityCurrent);
    this.serviceHumiditySensor.updateCharacteristic(Characteristic.StatusActive, this.Status.isPowerOn);
  }

  public get Status() {
    return new DehumidifierStatus(this.accessory.context.device.snapshot);
  }
}

export class DehumidifierStatus {
  constructor(protected data: any) {}

  public get isPowerOn() {
    return this.data['airState.operation'] as boolean;
  }

  public get opMode() {
    return this.data['airState.opMode'] as number;
  }

  public get windStrength() {
    return this.data['airState.windStrength'] as number;
  }

  public get isDehumidifying() {
    return [17, 18, 19, 21].includes(this.opMode) && this.humidityCurrent >= this.humidityTarget;
  }

  public get humidityCurrent() {
    return this.data['airState.humidity.current'] || 0;
  }

  public get humidityTarget() {
    return this.data['airState.humidity.desired'] || 0;
  }

  public get rotationSpeed() {
    const index = Object.keys(RotateSpeed).indexOf(parseInt(this.data['airState.windStrength']).toString());
    return index !== -1 ? index + 1 : Object.keys(RotateSpeed).length / 2;
  }

  public get isWaterTankFull() {
    return !!this.data['airState.notificationExt'];
  }
}
