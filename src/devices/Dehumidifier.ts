import {baseDevice} from '../baseDevice';
import {LGThinQHomebridgePlatform} from '../platform';
import {CharacteristicValue, PlatformAccessory} from 'homebridge';
import {Device} from '../lib/Device';

enum RotateSpeed {
  LOW = 2,
  HIGH = 6,
}

export default class Dehumidifier extends baseDevice {
  protected serviceDehumidifier;
  protected serviceHumiditySensor;
  constructor(
    protected readonly platform: LGThinQHomebridgePlatform,
    protected readonly accessory: PlatformAccessory,
  ) {
    super(platform, accessory);

    const {
      Service: {
        HumidifierDehumidifier,
        HumiditySensor,
      },
      Characteristic,
    } = this.platform;

    const device: Device = accessory.context.device;
    this.platform.log.debug('Dehumidifier data: ', JSON.stringify(device.data));

    this.serviceDehumidifier = accessory.getService(HumidifierDehumidifier) || accessory.addService(HumidifierDehumidifier);
    this.serviceDehumidifier.setCharacteristic(Characteristic.Name, device.name);
    this.serviceDehumidifier.getCharacteristic(Characteristic.Active)
      .onSet(this.setActive.bind(this));
    this.serviceDehumidifier.getCharacteristic(Characteristic.CurrentHumidifierDehumidifierState)
      .setProps({
        validValues: [0, 1, 3],
      });
    this.serviceDehumidifier.getCharacteristic(Characteristic.TargetHumidifierDehumidifierState)
      .setProps({
        validValues: [2],
      })
      .setValue(Characteristic.TargetHumidifierDehumidifierState.DEHUMIDIFIER);

    this.serviceDehumidifier.getCharacteristic(Characteristic.RelativeHumidityDehumidifierThreshold)
      .onSet(this.setHumidityThreshold.bind(this))
      .setProps({
        minValue: 0,
        maxValue: 100,
        minStep: 1,
      });

    this.serviceDehumidifier.getCharacteristic(Characteristic.RotationSpeed)
      .onSet(this.setSpeed.bind(this));

    this.serviceHumiditySensor = accessory.getService(HumiditySensor) || accessory.addService(HumiditySensor);
    this.serviceHumiditySensor.addLinkedService(this.serviceDehumidifier);

    this.updateAccessoryCharacteristic(device);
  }

  async setActive(value: CharacteristicValue) {
    this.platform.log.debug('Set Dehumidifier Active State ->', value);
    const device: Device = this.accessory.context.device;
    const isOn = value as boolean;
    this.platform.ThinQ?.deviceControl(device.id, {
      dataKey: 'airState.operation',
      dataValue: isOn,
    }).then(() => {
      device.data.snapshot['airState.operation'] = isOn ? 1 : 0;
      this.updateAccessoryCharacteristic(device);
    });
  }

  async setHumidityThreshold(value: CharacteristicValue) {
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
    const device: Device = this.accessory.context.device;
    const values = Object.values(RotateSpeed);
    this.platform.ThinQ?.deviceControl(device.id, {
      dataKey: 'airState.windStrength',
      dataValue: values[Math.floor((value as number) / 50)] || RotateSpeed.HIGH, // 0-50 = LOW, 50-100 = HIGH
    });
    device.data.snapshot['airState.windStrength'] = value;
    this.updateAccessoryCharacteristic(device);
  }

  public updateAccessoryCharacteristic(device: Device) {
    super.updateAccessoryCharacteristic(device);
    const {
      Characteristic,
    } = this.platform;

    const Status = new DehumidifierStatus(device.snapshot);
    this.serviceDehumidifier.updateCharacteristic(Characteristic.Active, Status.isPowerOn ? 1 : 0);
    this.serviceDehumidifier.updateCharacteristic(Characteristic.CurrentRelativeHumidity, Status.humidityCurrent);
    this.serviceDehumidifier.updateCharacteristic(Characteristic.RelativeHumidityDehumidifierThreshold, Status.humidityTarget);
    const {INACTIVE, IDLE, DEHUMIDIFYING} = Characteristic.CurrentHumidifierDehumidifierState;
    const currentState = Status.isDehumidifying ? DEHUMIDIFYING : (Status.isPowerOn ? IDLE : INACTIVE);
    this.serviceDehumidifier.updateCharacteristic(Characteristic.CurrentHumidifierDehumidifierState, currentState);

    const rotateSpeed = Object.values(RotateSpeed).indexOf(Status.windStrength || RotateSpeed.LOW);
    this.serviceDehumidifier.updateCharacteristic(Characteristic.RotationSpeed, rotateSpeed);

    this.serviceHumiditySensor.updateCharacteristic(Characteristic.CurrentRelativeHumidity, Status.humidityCurrent);
    this.serviceHumiditySensor.updateCharacteristic(Characteristic.StatusActive, Status.isPowerOn);
  }
}

export class DehumidifierStatus {
  constructor(protected data) {}

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
    return this.isPowerOn && [17, 18, 19].includes(this.opMode);
  }

  public get humidityCurrent() {
    return this.data['airState.humidity.current'] || 0;
  }

  public get humidityTarget() {
    return this.data['airState.humidity.desired'] || 0;
  }
}
