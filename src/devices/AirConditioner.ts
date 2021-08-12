import {baseDevice} from '../baseDevice';
import {LGThinQHomebridgePlatform} from '../platform';
import {CharacteristicValue, PlatformAccessory} from 'homebridge';
import {Device} from '../lib/Device';

export enum FanSpeed {
  LOW = 2,
  LOW_MEDIUM = 3,
  MEDIUM = 4,
  MEDIUM_HIGH = 5,
  HIGH = 6,
}

export default class AirConditioner extends baseDevice {
  protected service;
  protected serviceAirQuality;

  constructor(
    protected readonly platform: LGThinQHomebridgePlatform,
    protected readonly accessory: PlatformAccessory,
  ) {
    super(platform, accessory);

    const {
      Service: {
        AirQualitySensor,
        HeaterCooler,
      },
      Characteristic,
    } = this.platform;

    platform.log.info('AC still in development.If you got problem,plz report at https://github.com/nVuln/homebridge-lg-thinq/issues');

    const device: Device = accessory.context.device;

    this.service = accessory.getService(HeaterCooler) || accessory.addService(HeaterCooler, device.name);
    this.service.setCharacteristic(Characteristic.Name, device.name);
    this.service.getCharacteristic(Characteristic.Active)
      .onSet(this.setActive.bind(this))
      .updateValue(Characteristic.Active.INACTIVE);
    this.service.getCharacteristic(Characteristic.CurrentHeaterCoolerState)
      .updateValue(Characteristic.CurrentHeaterCoolerState.INACTIVE);
    this.service.getCharacteristic(Characteristic.TargetHeaterCoolerState)
      .setProps({
        validValues: [Characteristic.TargetHeaterCoolerState.COOL, Characteristic.TargetHeaterCoolerState.HEAT],
      })
      .onSet(this.setTargetState.bind(this))
      .updateValue(Characteristic.TargetHeaterCoolerState.COOL);

    if (device.deviceModel.data.Value['airState.tempState.current']) {
      const currentTemperatureValue = device.deviceModel.data.Value['airState.tempState.current']?.value_validation;
      this.service.getCharacteristic(Characteristic.CurrentTemperature)
        .setProps({
          minValue: currentTemperatureValue.min,
          maxValue: currentTemperatureValue.max,
        })
        .updateValue(this.Status.currentTemperature);
    }

    if (device.deviceModel.data.Value['airState.tempState.target']) {
      const targetTemperatureValue = device.deviceModel.data.Value['airState.tempState.target']?.value_validation;
      this.service.getCharacteristic(Characteristic.CoolingThresholdTemperature)
        .setProps({
          minValue: targetTemperatureValue.min,
          maxValue: targetTemperatureValue.max,
        });
      this.service.getCharacteristic(Characteristic.HeatingThresholdTemperature)
        .setProps({
          minValue: targetTemperatureValue.min,
          maxValue: targetTemperatureValue.max,
        });
    }

    this.service.getCharacteristic(Characteristic.CoolingThresholdTemperature)
      .setProps({
        minStep: 1,
      })
      .onSet(this.setTargetTemperature.bind(this))
      .updateValue(this.Status.targetTemperature);
    this.service.getCharacteristic(Characteristic.HeatingThresholdTemperature)
      .setProps({
        minStep: 1,
      })
      .onSet(this.setTargetTemperature.bind(this))
      .updateValue(this.Status.targetTemperature);

    this.service.getCharacteristic(Characteristic.RotationSpeed)
      .setProps({
        minValue: 0,
        maxValue: Object.keys(FanSpeed).length / 2,
        minStep: 0.1,
      })
      .onSet(this.setFanSpeed.bind(this));
    this.service.getCharacteristic(Characteristic.SwingMode)
      .onSet(this.setSwingMode.bind(this));

    if (this.Status.airQuality) {
      // air quality
      this.serviceAirQuality = accessory.getService(AirQualitySensor) || accessory.addService(AirQualitySensor);
    }

    this.updateAccessoryCharacteristic(device);
  }

  public get Status() {
    return new ACStatus(this.accessory.context.device.snapshot);
  }

  public updateAccessoryCharacteristic(device: Device) {
    this.accessory.context.device = device;

    if (!device.snapshot.online) {
      // device not online, do not update status
      return;
    }

    const {
      Characteristic,
      Characteristic: {
        Active,
      },
    } = this.platform;

    this.service.updateCharacteristic(Characteristic.Active, this.Status.isPowerOn ? Active.ACTIVE : Active.INACTIVE);
    this.service.updateCharacteristic(Characteristic.CurrentTemperature, this.Status.currentTemperature);

    if (!this.Status.isPowerOn) {
      this.service.updateCharacteristic(Characteristic.CurrentHeaterCoolerState, Characteristic.CurrentHeaterCoolerState.INACTIVE);
    } else if ([0].includes(this.Status.opMode)) {
      this.service.updateCharacteristic(Characteristic.CurrentHeaterCoolerState, Characteristic.CurrentHeaterCoolerState.COOLING);
    } else if ([1, 4].includes(this.Status.opMode)) {
      this.service.updateCharacteristic(Characteristic.CurrentHeaterCoolerState, Characteristic.CurrentHeaterCoolerState.HEATING);
    } else if ([2, 8].includes(this.Status.opMode)) {
      this.service.updateCharacteristic(Characteristic.CurrentHeaterCoolerState, Characteristic.CurrentHeaterCoolerState.IDLE);
    } else {
      this.platform.log.warn('Unsupported value opMode = ', this.Status.opMode);
    }

    // air quality
    if (this.serviceAirQuality && this.Status.airQuality && this.Status.airQuality.isOn) {
      this.serviceAirQuality.updateCharacteristic(Characteristic.AirQuality, this.Status.airQuality.overall);
      if (this.Status.airQuality.PM2) {
        this.serviceAirQuality.updateCharacteristic(Characteristic.PM2_5Density, this.Status.airQuality.PM2);
      }

      if (this.Status.airQuality.PM10) {
        this.serviceAirQuality.updateCharacteristic(Characteristic.PM10Density, this.Status.airQuality.PM10);
      }
    }

    this.service.updateCharacteristic(Characteristic.RotationSpeed, this.Status.windStrength);
  }

  async setTargetState(value: CharacteristicValue) {
    this.platform.log.info('Set target AC mode = ', value);
  }

  async setActive(value: CharacteristicValue) {
    const device: Device = this.accessory.context.device;
    const isOn = value as boolean ? 1 : 0;
    if (this.Status.isPowerOn && isOn) {
      return; // don't send same status
    }

    this.platform.ThinQ?.deviceControl(device.id, {
      dataKey: 'airState.operation',
      dataValue: isOn as number,
    }).then(() => {
      device.data.snapshot['airState.operation'] = isOn as number;
      this.updateAccessoryCharacteristic(device);
    });
  }

  async setTargetTemperature(value: CharacteristicValue) {
    if (!this.Status.isPowerOn) {
      return;
    }

    const device: Device = this.accessory.context.device;
    this.platform.ThinQ?.deviceControl(device.id, {
      dataKey: 'airState.tempState.target',
      dataValue: value as number,
    }).then(() => {
      device.data.snapshot['airState.tempState.target'] = value as number;
      this.updateAccessoryCharacteristic(device);
    });
  }

  async setFanSpeed(value: CharacteristicValue) {
    if (!this.Status.isPowerOn) {
      return;
    }

    const speedValue = Math.max(1, Math.round(value as number));

    this.platform.log.info('Set fan speed = ', speedValue);
    const device: Device = this.accessory.context.device;
    const windStrength = Object.keys(FanSpeed)[speedValue - 1] || FanSpeed.HIGH;
    this.platform.ThinQ?.deviceControl(device.id, {
      dataKey: 'airState.windStrength',
      dataValue: windStrength,
    }).then(() => {
      device.data.snapshot['airState.windStrength'] = windStrength;
      this.updateAccessoryCharacteristic(device);
    });
  }

  async setSwingMode(value: CharacteristicValue) {
    if (!this.Status.isPowerOn) {
      return;
    }

    const device: Device = this.accessory.context.device;
    this.platform.ThinQ?.deviceControl(device.id, {
      dataKey: 'airState.wDir.vStep',
      dataValue: value as number,
    }).then(() => {
      device.data.snapshot['airState.wDir.vStep'] = value as number;
      this.updateAccessoryCharacteristic(device);
    });
  }
}

class ACStatus {
  constructor(protected data) {
  }

  public get opMode() {
    return this.data['airState.opMode'] as number;
  }

  public get isPowerOn() {
    return !!this.data['airState.operation'] as boolean;
  }

  public get currentTemperature() {
    return this.data['airState.tempState.current'] as number;
  }

  public get targetTemperature() {
    return this.data['airState.tempState.target'] as number;
  }

  public get airQuality() {
    // air quality not available
    if (!('airState.quality.overall' in this.data) && !('airState.quality.PM2' in this.data) && !('airState.quality.PM10' in this.data)) {
      return null;
    }

    return {
      isOn: this.isPowerOn || this.data['airState.quality.sensorMon'],
      overall: parseInt(this.data['airState.quality.overall']),
      PM2: parseInt(this.data['airState.quality.PM2'] || '0'),
      PM10: parseInt(this.data['airState.quality.PM10'] || '0'),
    };
  }

  // fan service
  public get windStrength() {
    const index = Object.keys(FanSpeed).indexOf(parseInt(this.data['airState.windStrength']).toString());
    return index !== -1 ? index + 1 : Object.keys(FanSpeed).length / 2;
  }
}
