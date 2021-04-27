import {baseDevice} from '../baseDevice';
import {LGThinQHomebridgePlatform} from '../platform';
import {CharacteristicValue, PlatformAccessory} from 'homebridge';
import {Device} from '../lib/Device';

export default class Dehumidifier extends baseDevice {
  protected serviceDehumidifier;
  protected serviceTemperatureSensor;
  constructor(
    protected readonly platform: LGThinQHomebridgePlatform,
    protected readonly accessory: PlatformAccessory,
  ) {
    super(platform, accessory);

    const {
      Service: {
        HumidifierDehumidifier,
        TemperatureSensor,
      },
      Characteristic,
    } = this.platform;

    const device: Device = accessory.context.device;

    this.serviceDehumidifier = accessory.getService(HumidifierDehumidifier) || accessory.addService(HumidifierDehumidifier);
    this.serviceDehumidifier.setCharacteristic(Characteristic.Name, device.name);
    this.serviceDehumidifier.getCharacteristic(Characteristic.TargetHumidifierDehumidifierState)
      .setProps({
        minValue: 0,
        maxValue: 1,
        validValues: [0, 1],
      });
    this.serviceDehumidifier.updateCharacteristic(Characteristic.TargetHumidifierDehumidifierState, 0);

    this.serviceDehumidifier.getCharacteristic(Characteristic.RelativeHumidityHumidifierThreshold)
      .onSet(this.setHumidityThreshold.bind(this))
      .setProps({
        minValue: 0,
        maxValue: 100,
        minStep: 1,
      });

    this.serviceTemperatureSensor = accessory.getService(TemperatureSensor) || accessory.addService(TemperatureSensor);
    this.serviceTemperatureSensor.addLinkedService(this.serviceDehumidifier);

    this.updateAccessoryCharacteristic(device);
  }

  async setHumidityThreshold(value: CharacteristicValue) {
    const device: Device = this.accessory.context.device;
    this.platform.ThinQ?.deviceControl(device.id, {
      dataKey: 'airState.humidity.desired',
      dataValue: value as number,
    });
    device.data.snapshot['airState.humidity.desired'] = value;
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
    this.serviceDehumidifier.updateCharacteristic(Characteristic.RelativeHumidityHumidifierThreshold, Status.humidityTarget);

    if (Status.isPowerOn) {
      this.serviceDehumidifier.updateCharacteristic(Characteristic.CurrentHumidifierDehumidifierState, Status.isHumidifying ? 2 : 3);
    } else {
      this.serviceDehumidifier.updateCharacteristic(Characteristic.CurrentHumidifierDehumidifierState, 0);
    }

    this.serviceTemperatureSensor.updateCharacteristic(Characteristic.CurrentTemperature, Status.temperatureCurrent);
  }
}

export class DehumidifierStatus {
  constructor(protected data) {}

  public get isPowerOn() {
    return this.data['airState.operation'] as boolean;
  }

  public get isHumidifying() {
    return this.humidityCurrent < this.humidityTarget;
  }

  public get humidityCurrent() {
    return this.data['airState.humidity.current'] || 0;
  }

  public get humidityTarget() {
    return this.data['airState.humidity.desired'] || 0;
  }

  public get temperatureCurrent() {
    return this.data['airState.tempState.current'] as number;
  }
}
