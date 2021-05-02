import {baseDevice} from '../baseDevice';
import {LGThinQHomebridgePlatform} from '../platform';
import {CharacteristicValue, PlatformAccessory} from 'homebridge';
import {Device} from '../lib/Device';

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

    this.serviceDehumidifier = accessory.getService(HumidifierDehumidifier) || accessory.addService(HumidifierDehumidifier);
    this.serviceDehumidifier.setCharacteristic(Characteristic.Name, device.name);
    this.serviceDehumidifier.getCharacteristic(Characteristic.Active)
      .onSet(this.setActive.bind(this));
    this.serviceDehumidifier.getCharacteristic(Characteristic.CurrentHumidifierDehumidifierState)
      .setProps({
        validValues: [0, 3],
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
    });
    device.data.snapshot['airState.operation'] = isOn ? 1 : 0;
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
    this.serviceDehumidifier.updateCharacteristic(Characteristic.RelativeHumidityDehumidifierThreshold, Status.humidityTarget);
    this.serviceDehumidifier.updateCharacteristic(Characteristic.CurrentHumidifierDehumidifierState, Status.isPowerOn ? 3 : 0);

    this.serviceHumiditySensor.updateCharacteristic(Characteristic.CurrentRelativeHumidity, Status.humidityCurrent);
    this.serviceHumiditySensor.updateCharacteristic(Characteristic.StatusActive, Status.isPowerOn);
  }
}

export class DehumidifierStatus {
  constructor(protected data) {}

  public get isPowerOn() {
    return this.data['airState.operation'] as boolean;
  }

  public get humidityCurrent() {
    return this.data['airState.humidity.current'] || 0;
  }

  public get humidityTarget() {
    return this.data['airState.humidity.desired'] || 0;
  }
}
