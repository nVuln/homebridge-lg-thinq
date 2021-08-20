import {baseDevice} from '../baseDevice';
import {LGThinQHomebridgePlatform} from '../platform';
import {CharacteristicValue, PlatformAccessory} from 'homebridge';
import {Device} from '../lib/Device';
import {DeviceModel, RangeValue} from '../lib/DeviceModel';

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
  protected serviceSensor;
  protected serviceSwitch;
  protected serviceLight;

  constructor(
    protected readonly platform: LGThinQHomebridgePlatform,
    protected readonly accessory: PlatformAccessory,
  ) {
    super(platform, accessory);

    const device: Device = this.accessory.context.device;
    platform.log.info('AC still in development.If you got problem,plz report at https://github.com/nVuln/homebridge-lg-thinq/issues');

    const {
      Service: {
        TemperatureSensor,
        Switch,
        Lightbulb,
      },
    } = this.platform;

    this.createHeaterCoolerService();

    if (this.config?.ac_air_quality as boolean && this.Status.airQuality) {
      this.createAirQualityService();
    }

    if (this.config.ac_temperature_sensor as boolean) {
      this.serviceSensor = accessory.getService(TemperatureSensor) || accessory.addService(TemperatureSensor);
      this.serviceSensor.updateCharacteristic(platform.Characteristic.StatusActive, false);
      this.serviceSensor.addLinkedService(this.service);
    }

    if (this.config.ac_led_control as boolean) {
      this.serviceLight = accessory.getService(Lightbulb) || accessory.addService(Lightbulb);
      this.serviceLight.getCharacteristic(platform.Characteristic.On)
        .onSet(this.setLight.bind(this))
        .updateValue(false); // off as default
      this.serviceLight.addLinkedService(this.service);
    }

    // more feature
    if (device.model === 'RAC_056905_WW') {
      this.serviceSwitch = accessory.getService(Switch) || accessory.addService(Switch, 'Jet Mode');
      this.serviceSwitch.updateCharacteristic(platform.Characteristic.Name, 'Jet Mode');
      this.serviceSwitch.getCharacteristic(platform.Characteristic.On)
        .onSet((value: CharacteristicValue) => {
          if (this.Status.isPowerOn) {
            this.platform.ThinQ?.deviceControl(device.id, {
              dataKey: 'airState.wMode.jet',
              dataValue: value ? 1 : 0,
            }).then(() => {
              device.data.snapshot['airState.wMode.jet'] = value ? 1 : 0;
              this.updateAccessoryCharacteristic(device);
            });
          }
        });
    }

    this.updateAccessoryCharacteristic(this.accessory.context.device);
  }

  public get config() {
    return Object.assign({}, {
      ac_swing_mode: 'BOTH',
      ac_air_quality: false,
      ac_mode: 'BOTH',
      ac_temperature_sensor: false,
      ac_led_control: false,
    }, super.config);
  }

  public get Status() {
    return new ACStatus(this.accessory.context.device.snapshot, this.accessory.context.device.deviceModel);
  }

  public updateAccessoryCharacteristic(device: Device) {
    this.accessory.context.device = device;

    if (!device.online) {
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
    this.service.updateCharacteristic(Characteristic.CoolingThresholdTemperature, this.Status.targetTemperature);
    this.service.updateCharacteristic(Characteristic.HeatingThresholdTemperature, this.Status.targetTemperature);

    if (!this.Status.isPowerOn) {
      this.service.updateCharacteristic(Characteristic.CurrentHeaterCoolerState, Characteristic.CurrentHeaterCoolerState.INACTIVE);
    } else if ([0].includes(this.Status.opMode)) {
      this.service.updateCharacteristic(Characteristic.CurrentHeaterCoolerState, Characteristic.CurrentHeaterCoolerState.COOLING);
    } else if ([1, 4].includes(this.Status.opMode)) {
      this.service.updateCharacteristic(Characteristic.CurrentHeaterCoolerState, Characteristic.CurrentHeaterCoolerState.HEATING);
    } else if ([2, 8].includes(this.Status.opMode)) {
      this.service.updateCharacteristic(Characteristic.CurrentHeaterCoolerState, Characteristic.CurrentHeaterCoolerState.IDLE);
    } else if ([6].includes(this.Status.opMode)) {
      // auto mode, detect based on current & target temperature
      if (this.Status.currentTemperature < this.Status.targetTemperature) {
        this.service.updateCharacteristic(Characteristic.CurrentHeaterCoolerState, Characteristic.CurrentHeaterCoolerState.HEATING);
      } else {
        this.service.updateCharacteristic(Characteristic.CurrentHeaterCoolerState, Characteristic.CurrentHeaterCoolerState.COOLING);
      }
    } else {
      this.platform.log.warn('Unsupported value opMode = ', this.Status.opMode);
    }

    if (this.config.ac_mode === 'BOTH') {
      if (this.Status.currentTemperature < this.Status.targetTemperature) {
        this.service.updateCharacteristic(Characteristic.TargetHeaterCoolerState, Characteristic.TargetHeaterCoolerState.HEAT);
      } else {
        this.service.updateCharacteristic(Characteristic.TargetHeaterCoolerState, Characteristic.TargetHeaterCoolerState.COOL);
      }
    }

    this.service.updateCharacteristic(Characteristic.RotationSpeed, this.Status.windStrength);
    // eslint-disable-next-line max-len
    this.service.updateCharacteristic(Characteristic.SwingMode, this.Status.isSwingOn ? Characteristic.SwingMode.SWING_ENABLED : Characteristic.SwingMode.SWING_DISABLED);

    // air quality
    if (this.config?.ac_air_quality as boolean && this.serviceAirQuality && this.Status.airQuality && this.Status.airQuality.isOn) {
      this.serviceAirQuality.updateCharacteristic(Characteristic.AirQuality, this.Status.airQuality.overall);
      if (this.Status.airQuality.PM2) {
        this.serviceAirQuality.updateCharacteristic(Characteristic.PM2_5Density, this.Status.airQuality.PM2);
      }

      if (this.Status.airQuality.PM10) {
        this.serviceAirQuality.updateCharacteristic(Characteristic.PM10Density, this.Status.airQuality.PM10);
      }
    }

    // temperature sensor
    if (this.config.ac_temperature_sensor as boolean && this.serviceSensor) {
      this.serviceSensor.updateCharacteristic(Characteristic.CurrentTemperature, this.Status.currentTemperature);
      this.serviceSensor.updateCharacteristic(Characteristic.StatusActive, this.Status.isPowerOn);
    }

    if (this.config.ac_led_control as boolean && this.serviceLight) {
      this.serviceLight.updateCharacteristic(Characteristic.On, this.Status.isLightOn);
    }

    // more feature
    if (device.model === 'RAC_056905_WW' && this.serviceSwitch) {
      this.serviceSwitch.updateCharacteristic(Characteristic.On, !!device.snapshot['airState.wMode.jet']);
    }
  }

  async setLight(value: CharacteristicValue) {
    if (!this.Status.isPowerOn) {
      return;
    }

    const device: Device = this.accessory.context.device;
    this.platform.ThinQ?.deviceControl(device.id, {
      dataKey: 'airState.lightingState.displayControl',
      dataValue: value ? 1 : 0,
    }).then(() => {
      device.data.snapshot['airState.lightingState.displayControl'] = value ? 1 : 0;
      this.updateAccessoryCharacteristic(device);
    });
  }

  async setTargetState(value: CharacteristicValue) {
    this.platform.log.debug('Set target AC mode = ', value);
    // temporarily disable, revert to old value in 0.2s
    setTimeout(() => {
      this.updateAccessoryCharacteristic(this.accessory.context.device);
    }, 200);
    /*const {
      Characteristic: {
        TargetHeaterCoolerState,
      },
    } = this.platform;

    const device: Device = this.accessory.context.device;
    const opMode = value === TargetHeaterCoolerState.HEAT ? 4 : 0;
    await this.setOpMode(opMode);
    */
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
    }, 'Operation').then(() => {
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

    const swingValue = !!value as boolean ? '100' : '0';

    const device: Device = this.accessory.context.device;

    if (this.config.ac_swing_mode === 'BOTH') {
      this.platform.ThinQ?.deviceControl(device.id, {
        dataKey: null,
        dataValue: null,
        dataSetList: {
          'airState.wDir.vStep': swingValue,
          'airState.wDir.hStep': swingValue,
        },
        dataGetList: null,
      }, 'Set', 'favoriteCtrl').then(() => {
        device.data.snapshot['airState.wDir.vStep'] = swingValue;
        device.data.snapshot['airState.wDir.hStep'] = swingValue;
        this.updateAccessoryCharacteristic(device);
      });
    } else if (this.config.ac_swing_mode === 'VERTICAL') {
      this.platform.ThinQ?.deviceControl(device.id, {
        dataKey: 'airState.wDir.vStep',
        dataValue: swingValue,
      }).then(() => {
        device.data.snapshot['airState.wDir.vStep'] = swingValue;
        this.updateAccessoryCharacteristic(device);
      });
    } else if (this.config.ac_swing_mode === 'HORIZONTAL') {
      this.platform.ThinQ?.deviceControl(device.id, {
        dataKey: 'airState.wDir.hStep',
        dataValue: swingValue,
      }).then(() => {
        device.data.snapshot['airState.wDir.hStep'] = swingValue;
        this.updateAccessoryCharacteristic(device);
      });
    }
  }

  protected createAirQualityService() {
    const {
      Service: {
        AirQualitySensor,
      },
    } = this.platform;

    this.serviceAirQuality = this.accessory.getService(AirQualitySensor) || this.accessory.addService(AirQualitySensor);
  }

  protected createHeaterCoolerService() {
    const {
      Service: {
        HeaterCooler,
      },
      Characteristic,
    } = this.platform;

    const device: Device = this.accessory.context.device;

    this.service = this.accessory.getService(HeaterCooler) || this.accessory.addService(HeaterCooler, device.name);
    this.service.setCharacteristic(Characteristic.Name, device.name);
    this.service.getCharacteristic(Characteristic.Active)
      .onSet(this.setActive.bind(this))
      .updateValue(Characteristic.Active.INACTIVE);
    this.service.getCharacteristic(Characteristic.CurrentHeaterCoolerState)
      .updateValue(Characteristic.CurrentHeaterCoolerState.INACTIVE);

    const targetStates: number[] = [];
    if (this.config.ac_mode === 'BOTH' || this.config.ac_mode === 'COOLING') {
      targetStates.push(Characteristic.TargetHeaterCoolerState.COOL);
    }
    if (this.config.ac_mode === 'BOTH' || this.config.ac_mode === 'HEATING') {
      targetStates.push(Characteristic.TargetHeaterCoolerState.HEAT);
    }

    this.service.getCharacteristic(Characteristic.TargetHeaterCoolerState)
      .setProps({
        validValues: targetStates,
      })
      .onSet(this.setTargetState.bind(this))
      .updateValue(targetStates[0] || 0);

    const currentTemperatureValue = device.deviceModel.value('airState.tempState.current') as RangeValue;
    if (currentTemperatureValue) {
      this.service.getCharacteristic(Characteristic.CurrentTemperature)
        .setProps({
          minValue: currentTemperatureValue.min,
          maxValue: currentTemperatureValue.max,
        });
    }

    this.service.updateCharacteristic(Characteristic.CurrentTemperature, this.Status.currentTemperature);

    const targetTemperatureValue = device.deviceModel.value('airState.tempState.target') as RangeValue;
    if (targetTemperatureValue) {
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
      .onSet(this.setTargetTemperature.bind(this));
    this.service.getCharacteristic(Characteristic.HeatingThresholdTemperature)
      .setProps({
        minStep: 1,
      })
      .onSet(this.setTargetTemperature.bind(this));

    this.service.getCharacteristic(Characteristic.RotationSpeed)
      .setProps({
        minValue: 0,
        maxValue: Object.keys(FanSpeed).length / 2,
        minStep: 0.1,
      })
      .onSet(this.setFanSpeed.bind(this));
    this.service.getCharacteristic(Characteristic.SwingMode)
      .onSet(this.setSwingMode.bind(this));
  }

  private async setOpMode(opMode) {
    const device: Device = this.accessory.context.device;
    return this.platform.ThinQ?.deviceControl(device.id, {
      dataKey: 'airState.opMode',
      dataValue: opMode,
    }).then(() => {
      device.data.snapshot['airState.opMode'] = opMode;
      this.updateAccessoryCharacteristic(device);
    });
  }
}

export class ACStatus {
  constructor(protected data, protected deviceModel: DeviceModel) {
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

  public get isSwingOn() {
    const vStep = Math.floor((this.data['airState.wDir.vStep'] || 0) / 100),
      hStep = Math.floor((this.data['airState.wDir.hStep'] || 0) / 100);
    return !!(vStep + hStep);
  }

  public get isLightOn() {
    return !!this.data['airState.lightingState.displayControl'];
  }
}
