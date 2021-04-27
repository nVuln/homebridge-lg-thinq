import {baseDevice} from '../baseDevice';
import {LGThinQHomebridgePlatform} from '../platform';
import {PlatformAccessory} from 'homebridge';
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
    this.serviceDehumidifier.setCharacteristic(Characteristic.TargetHumidifierDehumidifierState, 0); // AUTO

    this.serviceTemperatureSensor = accessory.getService(TemperatureSensor) || accessory.addService(TemperatureSensor);
    this.serviceTemperatureSensor.addLinkedService(this.serviceDehumidifier);
  }

  public updateAccessoryCharacteristic(device: Device) {
    super.updateAccessoryCharacteristic(device);
    const {
      Characteristic,
    } = this.platform;

    const Status = new DehumidifierStatus(device.snapshot);
    this.serviceDehumidifier.updateCharacteristic(Characteristic.Active, Status.isPowerOn ? 1 : 0);
    this.serviceDehumidifier.updateCharacteristic(Characteristic.CurrentRelativeHumidity, Status.humidityCurrent);

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
