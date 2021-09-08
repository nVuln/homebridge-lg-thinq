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
  protected serviceFanV2;
  protected serviceAutoMode;

  protected jetModeModels = ['RAC_056905_CA', 'RAC_056905_WW'];
  protected currentTargetState;

  constructor(
    protected readonly platform: LGThinQHomebridgePlatform,
    protected readonly accessory: PlatformAccessory,
  ) {
    super(platform, accessory);

    const device: Device = this.accessory.context.device;

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
    if (this.isJetModeEnabled(device)) {
      this.serviceSwitch = accessory.getService(Switch) || accessory.addService(Switch, 'Jet Mode');
      this.serviceSwitch.updateCharacteristic(platform.Characteristic.Name, 'Jet Mode');
      this.serviceSwitch.getCharacteristic(platform.Characteristic.On)
        .onSet((value: CharacteristicValue) => {
          if (this.Status.isPowerOn && this.Status.opMode === 0) {
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

    if (this.config.ac_fan_control as boolean) {
      this.createFanService();
    }

    this.serviceAutoMode = accessory.getService(Switch) || accessory.addService(Switch, 'Auto Mode');
    this.serviceAutoMode.addLinkedService(this.service);
    this.serviceAutoMode.updateCharacteristic(platform.Characteristic.Name, 'Auto Mode');
    this.serviceAutoMode.getCharacteristic(platform.Characteristic.On)
      .onSet(async (value: CharacteristicValue) => {
        if (value as boolean) {
          if (this.Status.opMode !== 6) {
            await this.setOpMode(6).then(() => {
              device.data.snapshot['airState.opMode'] = 6;
              this.updateAccessoryCharacteristic(device);
            });
          }
        } else {
          device.data.snapshot['airState.opMode'] = -1;
          this.updateAccessoryCharacteristic(device);
          await this.setTargetState(this.currentTargetState);
        }
      });

    this.updateAccessoryCharacteristic(this.accessory.context.device);
  }

  public get config() {
    return Object.assign({}, {
      ac_swing_mode: 'BOTH',
      ac_air_quality: false,
      ac_mode: 'BOTH',
      ac_temperature_sensor: false,
      ac_led_control: false,
      ac_fan_control: false,
    }, super.config);
  }

  public get Status() {
    return new ACStatus(this.accessory.context.device.snapshot, this.accessory.context.device.deviceModel);
  }

  async setFanMode(value: CharacteristicValue) {
    if (!this.Status.isPowerOn) {
      return;
    }

    const windStrength = value ? 8 : FanSpeed.HIGH; // 8 mean fan auto mode
    await this.setFanSpeed(windStrength);
  }

  public updateAccessoryCharacteristic(device: Device) {
    this.accessory.context.device = device;

    const {
      Characteristic,
      Characteristic: {
        Active,
      },
    } = this.platform;

    this.service.updateCharacteristic(Characteristic.Active, this.Status.isPowerOn ? Active.ACTIVE : Active.INACTIVE);
    if (this.Status.currentTemperature) {
      this.service.updateCharacteristic(Characteristic.CurrentTemperature, this.Status.currentTemperature);
    }

    if (this.Status.targetTemperature) {
      this.service.updateCharacteristic(Characteristic.CoolingThresholdTemperature, this.Status.targetTemperature);
      this.service.updateCharacteristic(Characteristic.HeatingThresholdTemperature, this.Status.targetTemperature);
    }

    if (!this.Status.isPowerOn) {
      this.service.updateCharacteristic(Characteristic.CurrentHeaterCoolerState, Characteristic.CurrentHeaterCoolerState.INACTIVE);
    } else if ([0].includes(this.Status.opMode)) {
      this.service.updateCharacteristic(Characteristic.CurrentHeaterCoolerState, Characteristic.CurrentHeaterCoolerState.COOLING);
    } else if ([1, 4].includes(this.Status.opMode)) {
      this.service.updateCharacteristic(Characteristic.CurrentHeaterCoolerState, Characteristic.CurrentHeaterCoolerState.HEATING);
    } else if ([2, 8].includes(this.Status.opMode)) {
      this.service.updateCharacteristic(Characteristic.CurrentHeaterCoolerState, Characteristic.CurrentHeaterCoolerState.IDLE);
    } else if ([6, -1].includes(this.Status.opMode)) {
      // auto mode, detect based on current & target temperature
      if (this.Status.currentTemperature < this.Status.targetTemperature) {
        this.service.updateCharacteristic(Characteristic.CurrentHeaterCoolerState, Characteristic.CurrentHeaterCoolerState.HEATING);
      } else {
        this.service.updateCharacteristic(Characteristic.CurrentHeaterCoolerState, Characteristic.CurrentHeaterCoolerState.COOLING);
      }
    } else {
      this.platform.log.warn('Unsupported value opMode = ', this.Status.opMode);
    }

    if (this.Status.opMode === 0) {
      this.service.updateCharacteristic(Characteristic.TargetHeaterCoolerState, Characteristic.TargetHeaterCoolerState.COOL);
    } else if ([1, 4].includes(this.Status.opMode)) {
      this.service.updateCharacteristic(Characteristic.TargetHeaterCoolerState, Characteristic.TargetHeaterCoolerState.HEAT);
    } else if ([6, -1].includes(this.Status.opMode)) {
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

    // handle fan service
    if (this.config?.ac_fan_control as boolean && this.serviceFanV2) {
      this.serviceFanV2.updateCharacteristic(Characteristic.Active, this.Status.isPowerOn ? Active.ACTIVE : Active.INACTIVE);
      this.serviceFanV2.updateCharacteristic(Characteristic.RotationSpeed, this.Status.windStrength);
      // eslint-disable-next-line max-len
      this.serviceFanV2.updateCharacteristic(Characteristic.SwingMode, this.Status.isSwingOn ? Characteristic.SwingMode.SWING_ENABLED : Characteristic.SwingMode.SWING_DISABLED);
    }

    if (this.config.ac_led_control as boolean && this.serviceLight) {
      this.serviceLight.updateCharacteristic(Characteristic.On, this.Status.isLightOn);
    }

    // more feature
    if (this.isJetModeEnabled(device) && this.serviceSwitch) {
      this.serviceSwitch.updateCharacteristic(Characteristic.On, !!device.snapshot['airState.wMode.jet']);
    }

    // auto mode
    this.serviceAutoMode.updateCharacteristic(Characteristic.On, this.Status.opMode === 6);
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
    this.currentTargetState = value;
    const {
      Characteristic: {
        TargetHeaterCoolerState,
      },
    } = this.platform;

    if (this.Status.opMode === 6) {
      return;
    }

    if (value === TargetHeaterCoolerState.HEAT && ![1, 4].includes(this.Status.opMode)) {
      await this.setOpMode(4);
    } else if (value === TargetHeaterCoolerState.COOL && ![0].includes(this.Status.opMode)) {
      await this.setOpMode(0);
    }
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

    const temperature = value as number;
    if (temperature === this.Status.targetTemperature) {
      return;
    }

    const device: Device = this.accessory.context.device;
    this.platform.ThinQ?.deviceControl(device.id, {
      dataKey: 'airState.tempState.target',
      dataValue: temperature,
    }).then(() => {
      device.data.snapshot['airState.tempState.target'] = temperature;
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

  async setOpMode(opMode) {
    const device: Device = this.accessory.context.device;
    return this.platform.ThinQ?.deviceControl(device.id, {
      dataKey: 'airState.opMode',
      dataValue: opMode,
    }).then(() => {
      device.data.snapshot['airState.opMode'] = opMode;
      this.updateAccessoryCharacteristic(device);
    });
  }

  protected isJetModeEnabled(device: Device) {
    return this.jetModeModels.includes(device.model) && this.Status.opMode === 0; // cool mode only
  }

  protected createFanService() {
    const {
      Service: {
        Fanv2,
      },
      Characteristic,
    } = this.platform;

    const device: Device = this.accessory.context.device;

    // fan controller
    this.serviceFanV2 = this.accessory.getService(Fanv2) || this.accessory.addService(Fanv2);
    this.serviceFanV2.addLinkedService(this.service);

    this.serviceFanV2.getCharacteristic(Characteristic.Active)
      .onSet((value: CharacteristicValue) => {
        const isOn = value as boolean;
        if ((this.Status.isPowerOn && isOn) || (!this.Status.isPowerOn && !isOn)) {
          return;
        }

        // do not allow change status via home app, revert to prev status in 0.1s
        setTimeout(() => {
          // eslint-disable-next-line max-len
          this.serviceFanV2.updateCharacteristic(Characteristic.Active, this.Status.isPowerOn ? Characteristic.Active.ACTIVE : Characteristic.Active.INACTIVE);
          this.serviceFanV2.updateCharacteristic(Characteristic.RotationSpeed, this.Status.windStrength);
        }, 100);
      })
      .updateValue(Characteristic.Active.INACTIVE);
    this.serviceFanV2.getCharacteristic(Characteristic.Name).updateValue(device.name + ' - Fan');
    this.serviceFanV2.getCharacteristic(Characteristic.CurrentFanState)
      .onGet(() => {
        return this.Status.isPowerOn ? Characteristic.CurrentFanState.BLOWING_AIR : Characteristic.CurrentFanState.INACTIVE;
      })
      .setProps({
        validValues: [Characteristic.CurrentFanState.INACTIVE, Characteristic.CurrentFanState.BLOWING_AIR],
      })
      .updateValue(Characteristic.CurrentFanState.INACTIVE);
    this.serviceFanV2.getCharacteristic(Characteristic.TargetFanState)
      .onSet(this.setFanMode.bind(this));
    this.serviceFanV2.getCharacteristic(Characteristic.RotationSpeed)
      .setProps({
        minValue: 0,
        maxValue: Object.keys(FanSpeed).length / 2,
        minStep: 0.1,
      })
      .updateValue(this.Status.windStrength)
      .onSet(this.setFanSpeed.bind(this));
    this.serviceFanV2.getCharacteristic(Characteristic.SwingMode)
      .onSet(this.setSwingMode.bind(this))
      .updateValue(this.Status.isSwingOn ? Characteristic.SwingMode.SWING_ENABLED : Characteristic.SwingMode.SWING_DISABLED);
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
      .onSet(this.setTargetState.bind(this));

    const currentTemperatureValue = device.deviceModel.value('airState.tempState.current') as RangeValue;
    if (currentTemperatureValue) {
      this.service.getCharacteristic(Characteristic.CurrentTemperature)
        .setProps({
          minValue: currentTemperatureValue.min,
          maxValue: currentTemperatureValue.max,
        });
    }

    if (this.Status.currentTemperature) {
      this.service.updateCharacteristic(Characteristic.CurrentTemperature, this.Status.currentTemperature);
    }

    const targetTemperatureValue = device.deviceModel.value('airState.tempState.target') as RangeValue;
    if (targetTemperatureValue) {
      this.service.getCharacteristic(Characteristic.CoolingThresholdTemperature)
        .setProps({
          minValue: targetTemperatureValue.min,
          maxValue: targetTemperatureValue.max,
          minStep: 1,
        });

      this.service.getCharacteristic(Characteristic.HeatingThresholdTemperature)
        .setProps({
          minValue: targetTemperatureValue.min,
          maxValue: targetTemperatureValue.max,
          minStep: 1,
        });
    }

    this.service.getCharacteristic(Characteristic.CoolingThresholdTemperature)
      .onSet(this.setTargetTemperature.bind(this));
    this.service.getCharacteristic(Characteristic.HeatingThresholdTemperature)
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
