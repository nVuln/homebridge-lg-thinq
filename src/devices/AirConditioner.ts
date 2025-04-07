import {baseDevice} from '../baseDevice';
import {LGThinQHomebridgePlatform} from '../platform';
import {CharacteristicValue, PlatformAccessory} from 'homebridge';
import {Device} from '../lib/Device';
import {EnumValue, RangeValue, ValueType} from '../lib/DeviceModel';
import {cToF} from '../helper';

export enum ACModelType {
  AWHP = 'AWHP',
  RAC = 'RAC',
}

export enum FanSpeed {
  LOW = 2,
  LOW_MEDIUM = 3,
  MEDIUM = 4,
  MEDIUM_HIGH = 5,
  HIGH = 6,
}

enum OpMode {
  AUTO = 6,
  COOL = 0,
  HEAT = 4,
  FAN = 2,
  DRY = 1,
  AIR_CLEAN = 5,
}

export default class AirConditioner extends baseDevice {
  protected service;
  protected serviceAirQuality;
  protected serviceSensor;
  protected serviceHumiditySensor;
  protected serviceLight;
  protected serviceFanV2;

  // more feature
  protected serviceJetMode; // jet mode
  protected serviceQuietMode;
  protected serviceEnergySaveMode;
  protected serviceAirClean;
  protected jetModeModels = ['RAC_056905'];
  protected quietModeModels = ['WINF_056905'];
  protected energySaveModeModels = ['WINF_056905', 'RAC_056905'];
  protected airCleanModels = ['RAC_056905'];
  protected currentTargetState = 2; // default target: COOL

  protected serviceLabelButtons;

  constructor(
    public readonly platform: LGThinQHomebridgePlatform,
    public readonly accessory: PlatformAccessory,
  ) {
    super(platform, accessory);

    const device: Device = this.accessory.context.device;

    const {
      Service: {
        TemperatureSensor,
        HumiditySensor,
        Switch,
        Lightbulb,
      },
    } = this.platform;

    this.createHeaterCoolerService();
    this.service.addOptionalCharacteristic(this.platform.customCharacteristics.TotalConsumption);

    if (this.config?.ac_air_quality as boolean && this.Status.airQuality) {
      this.createAirQualityService();
    } else if (this.serviceAirQuality) {
      accessory.removeService(this.serviceAirQuality);
    }

    this.serviceSensor = accessory.getService(TemperatureSensor);
    if (this.config.ac_temperature_sensor as boolean) {
      this.serviceSensor = this.serviceSensor || accessory.addService(TemperatureSensor);
      this.serviceSensor.updateCharacteristic(platform.Characteristic.StatusActive, false);
      this.serviceSensor.addLinkedService(this.service);
    } else if (this.serviceSensor) {
      accessory.removeService(this.serviceSensor);
      this.serviceSensor = null;
    }

    this.serviceHumiditySensor = accessory.getService(HumiditySensor);
    if (this.config.ac_humidity_sensor as boolean) {
      this.serviceHumiditySensor = this.serviceHumiditySensor || accessory.addService(HumiditySensor);
      this.serviceHumiditySensor.updateCharacteristic(platform.Characteristic.StatusActive, false);
      this.serviceSensor.addLinkedService(this.service);
    } else if (this.serviceHumiditySensor) {
      accessory.removeService(this.serviceHumiditySensor);
      this.serviceHumiditySensor = null;
    }

    this.serviceLight = accessory.getService(Lightbulb);
    if (this.config.ac_led_control as boolean) {
      this.serviceLight = this.serviceLight || accessory.addService(Lightbulb);
      this.serviceLight.getCharacteristic(platform.Characteristic.On)
        .onSet(this.setLight.bind(this))
        .updateValue(false); // off as default
      this.serviceLight.addLinkedService(this.service);
    } else if (this.serviceLight) {
      accessory.removeService(this.serviceLight);
      this.serviceLight = null;
    }

    if (this.config.ac_fan_control as boolean) {
      this.createFanService();
    } else if (this.serviceFanV2) {
      accessory.removeService(this.serviceFanV2);
    }

    // more feature
    if (this.config.ac_jet_control as boolean && this.isJetModeEnabled(device)) {
      this.serviceJetMode = accessory.getService('Jet Mode') || accessory.addService(Switch, 'Jet Mode', 'Jet Mode');
      this.serviceJetMode.updateCharacteristic(platform.Characteristic.Name, 'Jet Mode');
      this.serviceJetMode.getCharacteristic(platform.Characteristic.On)
        .onSet(this.setJetModeActive.bind(this));
    } else if (this.serviceJetMode) {
      accessory.removeService(this.serviceJetMode);
      this.serviceJetMode = null;
    }

    if (this.quietModeModels.includes(device.model)) {
      this.serviceQuietMode = accessory.getService('Quiet mode') || accessory.addService(Switch, 'Quiet mode', 'Quiet mode');
      this.serviceQuietMode.updateCharacteristic(platform.Characteristic.Name, 'Quiet mode');
      this.serviceQuietMode.getCharacteristic(platform.Characteristic.On)
        .onSet(this.setQuietModeActive.bind(this));
    }

    this.serviceEnergySaveMode = accessory.getService('Energy save');
    if (this.energySaveModeModels.includes(device.model) && this.config.ac_energy_save as boolean) {
      if (!this.serviceEnergySaveMode) {
        this.serviceEnergySaveMode = accessory.addService(Switch, 'Energy save', 'Energy save');
      }

      this.serviceEnergySaveMode.updateCharacteristic(platform.Characteristic.Name, 'Energy save');
      this.serviceEnergySaveMode.getCharacteristic(platform.Characteristic.On)
        .onSet(this.setEnergySaveActive.bind(this));
    } else if (this.serviceEnergySaveMode) {
      accessory.removeService(this.serviceEnergySaveMode);
      this.serviceEnergySaveMode = null;
    }

    this.serviceAirClean = accessory.getService('Air Purify');
    if (this.airCleanModels.includes(device.model) && this.config.ac_air_clean as boolean) {
      if (!this.serviceAirClean) {
        this.serviceAirClean = accessory.addService(Switch, 'Air Purify', 'Air Purify');
      }

      this.serviceAirClean.updateCharacteristic(platform.Characteristic.Name, 'Air Purify');
      this.serviceAirClean.getCharacteristic(platform.Characteristic.On)
        .onSet(this.setAirCleanActive.bind(this));
    } else if (this.serviceAirClean) {
      accessory.removeService(this.serviceAirClean);
      this.serviceAirClean = null;
    }

    this.setupButton(device);

    // send request every minute to update temperature
    // https://github.com/nVuln/homebridge-lg-thinq/issues/177
    setInterval(() => {
      if (device.online) {
        this.platform.ThinQ?.deviceControl(device.id, {
          dataKey: 'airState.mon.timeout',
          dataValue: '70',
        }, 'Set', 'allEventEnable', 'control').then(() => {
          // success
        });
      }
    }, 60000);

    // Add polling mechanism to check if device is responsive
    this.startDeviceOnlineStatusPolling();
  }

  // Method to start polling for device online status
  private startDeviceOnlineStatusPolling() {
    const POLLING_INTERVAL = 10000; // Check every 10 seconds

    setInterval(() => {
      const device: Device = this.accessory.context.device;

      // Skip if device is already marked as offline
      if (!device.online) {
        return;
      }

      // Try to get device status by sending a simple command
      this.platform.ThinQ?.deviceControl(device.id, {
        dataKey: 'airState.mon.timeout',
        dataValue: '1', // Just a quick check with a small value
      }, 'Set', 'allEventEnable', 'control')
        .then(success => {
          if (!success) {
            // If command failed, mark as offline
            device.data.online = false;
            this.accessory.context.device = device;
            this.platform.log.debug(`[${device.name}] Device is not responding, marking as offline`);

            // Force HomeKit to try to get the device status, which will trigger the onGet handler
            // and show the "No Response" in HomeKit
            this.service.getCharacteristic(this.platform.Characteristic.Active).emit('get', (err, value) => {
              if (err) {
                this.platform.log.debug(`[${device.name}] Error getting Active characteristic: ${err}`);
              }
            });
          }
        })
        .catch(error => {
          // If there's an error, mark device as offline
          device.data.online = false;
          this.accessory.context.device = device;
          this.platform.log.debug(`[${device.name}] Error checking device status: ${error}, marking as offline`);

          // Force HomeKit to try to get the device status
          this.service.getCharacteristic(this.platform.Characteristic.Active).emit('get', (err, value) => {
            if (err) {
              this.platform.log.debug(`[${device.name}] Error getting Active characteristic: ${err}`);
            }
          });
        });
    }, POLLING_INTERVAL);
  }

  public get config() {
    return Object.assign({}, {
      ac_swing_mode: 'BOTH',
      ac_air_quality: false,
      ac_mode: 'BOTH',
      ac_temperature_sensor: false,
      ac_humidity_sensor: false,
      ac_led_control: false,
      ac_fan_control: false,
      ac_jet_control: false,
      ac_temperature_unit: 'C',
      ac_buttons: [],
      ac_air_clean: true,
      ac_energy_save: true,
    }, super.config);
  }

  public get Status() {
    return new ACStatus(this.accessory.context.device.snapshot, this.accessory.context.device, this.config);
  }

  async setEnergySaveActive(value: CharacteristicValue) {
    const device: Device = this.accessory.context.device;

    if (this.Status.isPowerOn && this.Status.opMode === 0) {
      this.platform.ThinQ?.deviceControl(device.id, {
        dataKey: 'airState.powerSave.basic',
        dataValue: value ? 1 : 0,
      }).then(() => {
        device.data.snapshot['airState.powerSave.basic'] = value ? 1 : 0;
        this.updateAccessoryCharacteristic(device);
      });
    }
  }

  async setAirCleanActive(value: CharacteristicValue) {
    const device: Device = this.accessory.context.device;

    if (this.Status.isPowerOn && this.Status.opMode === 0) {
      this.platform.ThinQ?.deviceControl(device.id, {
        dataKey: 'airState.wMode.airClean',
        dataValue: value ? 1 : 0,
      }).then(() => {
        device.data.snapshot['airState.wMode.airClean'] = value ? 1 : 0;
        this.updateAccessoryCharacteristic(device);
      });
    }
  }

  async setQuietModeActive(value: CharacteristicValue) {
    const device: Device = this.accessory.context.device;

    if (this.Status.isPowerOn && this.Status.opMode === 0) {
      this.platform.ThinQ?.deviceControl(device.id, {
        dataKey: 'airState.miscFuncState.silentAWHP',
        dataValue: value ? 1 : 0,
      }).then(() => {
        device.data.snapshot['airState.miscFuncState.silentAWHP'] = value ? 1 : 0;
        this.updateAccessoryCharacteristic(device);
      });
    }
  }

  async setJetModeActive(value: CharacteristicValue) {
    const device: Device = this.accessory.context.device;

    if (this.Status.isPowerOn && this.Status.opMode === 0) {
      this.platform.ThinQ?.deviceControl(device.id, {
        dataKey: 'airState.wMode.jet',
        dataValue: value ? 1 : 0,
      }).then(() => {
        device.data.snapshot['airState.wMode.jet'] = value ? 1 : 0;
        this.updateAccessoryCharacteristic(device);
      });
    }
  }

  async setFanState(value: CharacteristicValue) {
    if (!this.Status.isPowerOn) {
      return;
    }

    const device: Device = this.accessory.context.device;
    const { TargetFanState } = this.platform.Characteristic;

    const windStrength = value === TargetFanState.AUTO ? 8 : FanSpeed.HIGH; // 8 mean fan auto mode
    return this.platform.ThinQ?.deviceControl(device.id, {
      dataKey: 'airState.windStrength',
      dataValue: windStrength,
    }).then(() => {
      device.data.snapshot['airState.windStrength'] = windStrength;
      this.updateAccessoryCharacteristic(device);
    });
  }

  public updateAccessoryCharacteristic(device: Device) {
    this.accessory.context.device = device;

    const {
      Characteristic,
      Characteristic: {
        Active,
        CurrentHeaterCoolerState,
      },
    } = this.platform;

    // Check if we can actually communicate with the device
    let isDeviceResponding = false;
    try {
      // Try to get the current state
      const currentState = this.Status;
      isDeviceResponding = currentState !== undefined && currentState !== null;
    } catch (error) {
      isDeviceResponding = false;
    }

    // Set Reachable characteristic based on device response status
    this.accessory.getService(this.platform.Service.AccessoryInformation)
      ?.updateCharacteristic(this.platform.Characteristic.Reachable, isDeviceResponding);

    // If device is not responding, don't update other characteristics
    if (!isDeviceResponding) {
      // Set all characteristics to indicate non-responsive state
      this.service.updateCharacteristic(Characteristic.Active, Active.INACTIVE);
      this.service.updateCharacteristic(Characteristic.CurrentHeaterCoolerState, CurrentHeaterCoolerState.INACTIVE);
      return;
    }

    this.service.updateCharacteristic(Characteristic.Active, this.Status.isPowerOn ? Active.ACTIVE : Active.INACTIVE);
    if (this.Status.currentTemperature) {
      this.service.updateCharacteristic(Characteristic.CurrentTemperature, this.Status.currentTemperature);
    }

    if (!this.Status.isPowerOn) {
      this.service.updateCharacteristic(Characteristic.CurrentHeaterCoolerState, Characteristic.CurrentHeaterCoolerState.INACTIVE);
    } else if ([OpMode.COOL].includes(this.Status.opMode)) {
      this.service.updateCharacteristic(Characteristic.CurrentHeaterCoolerState, Characteristic.CurrentHeaterCoolerState.COOLING);
      this.service.updateCharacteristic(Characteristic.TargetHeaterCoolerState, Characteristic.TargetHeaterCoolerState.COOL);
    } else if ([OpMode.HEAT].includes(this.Status.opMode)) {
      this.service.updateCharacteristic(Characteristic.CurrentHeaterCoolerState, Characteristic.CurrentHeaterCoolerState.HEATING);
      this.service.updateCharacteristic(Characteristic.TargetHeaterCoolerState, Characteristic.TargetHeaterCoolerState.HEAT);
    } else if ([OpMode.AUTO, -1].includes(this.Status.opMode)) {
      // auto mode, detect based on current & target temperature
      if (this.Status.currentTemperature < this.Status.targetTemperature) {
        this.service.updateCharacteristic(Characteristic.CurrentHeaterCoolerState, Characteristic.CurrentHeaterCoolerState.HEATING);
        this.service.updateCharacteristic(Characteristic.TargetHeaterCoolerState, Characteristic.TargetHeaterCoolerState.HEAT);
      } else {
        this.service.updateCharacteristic(Characteristic.CurrentHeaterCoolerState, Characteristic.CurrentHeaterCoolerState.COOLING);
        this.service.updateCharacteristic(Characteristic.TargetHeaterCoolerState, Characteristic.TargetHeaterCoolerState.COOL);
      }
    } else {
      // another mode
    }

    if (this.Status.targetTemperature) {
      if (this.service.getCharacteristic(CurrentHeaterCoolerState).value === CurrentHeaterCoolerState.HEATING) {
        this.service.updateCharacteristic(Characteristic.HeatingThresholdTemperature, this.Status.targetTemperature);
      }

      if (this.service.getCharacteristic(CurrentHeaterCoolerState).value === CurrentHeaterCoolerState.COOLING) {
        this.service.updateCharacteristic(Characteristic.CoolingThresholdTemperature, this.Status.targetTemperature);
      }
    }

    this.service.updateCharacteristic(Characteristic.RotationSpeed, this.Status.windStrength);
    // eslint-disable-next-line max-len
    if (this.config.ac_swing_mode !== 'NONE') {
      this.service.updateCharacteristic(Characteristic.SwingMode, this.Status.isSwingOn ? Characteristic.SwingMode.SWING_ENABLED : Characteristic.SwingMode.SWING_DISABLED);
    }

    this.service.updateCharacteristic(this.platform.customCharacteristics.TotalConsumption, this.Status.currentConsumption);

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

    // humidity sensor
    if (this.config.ac_humidity_sensor as boolean && this.serviceHumiditySensor) {
      this.serviceHumiditySensor.updateCharacteristic(Characteristic.CurrentRelativeHumidity, this.Status.currentRelativeHumidity);
      this.serviceHumiditySensor.updateCharacteristic(Characteristic.StatusActive, this.Status.isPowerOn);
    }

    // handle fan service
    if (this.config?.ac_fan_control as boolean && this.serviceFanV2) {
      this.serviceFanV2.updateCharacteristic(Characteristic.Active, this.Status.isPowerOn ? Active.ACTIVE : Active.INACTIVE);
      this.serviceFanV2.updateCharacteristic(Characteristic.RotationSpeed, this.Status.windStrength);
      // eslint-disable-next-line max-len
      if (this.config.ac_swing_mode !== 'NONE') {
        this.serviceFanV2.updateCharacteristic(Characteristic.SwingMode, this.Status.isSwingOn ? Characteristic.SwingMode.SWING_ENABLED : Characteristic.SwingMode.SWING_DISABLED);
      }
    }

    if (this.config.ac_led_control as boolean && this.serviceLight) {
      this.serviceLight.updateCharacteristic(Characteristic.On, this.Status.isLightOn);
    }

    // more feature
    if (this.isJetModeEnabled(device) && this.serviceJetMode) {
      this.serviceJetMode.updateCharacteristic(Characteristic.On, !!device.snapshot['airState.wMode.jet']);
    }

    if (this.quietModeModels.includes(device.model) && this.serviceQuietMode) {
      this.serviceQuietMode.updateCharacteristic(Characteristic.On, !!device.snapshot['airState.miscFuncState.silentAWHP']);
    }

    if (this.energySaveModeModels.includes(device.model) && this.config.ac_energy_save as boolean) {
      this.serviceEnergySaveMode.updateCharacteristic(Characteristic.On, !!device.snapshot['airState.powerSave.basic']);
    }

    if (this.airCleanModels.includes(device.model) && this.config.ac_air_clean as boolean) {
      this.serviceAirClean.updateCharacteristic(Characteristic.On, !!device.snapshot['airState.wMode.airClean']);
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
    const {
      Characteristic: {
        TargetHeaterCoolerState,
      },
    } = this.platform;

    // Validate the target state value
    const validValues = [TargetHeaterCoolerState.AUTO, TargetHeaterCoolerState.HEAT, TargetHeaterCoolerState.COOL];
    if (!validValues.includes(value as number)) {
      this.platform.log.warn(`[${this.accessory.context.device.name}] Invalid target state: ${value}, defaulting to AUTO`);
      value = TargetHeaterCoolerState.AUTO;
    }

    this.currentTargetState = value as number;

    // Map HomeKit states to LG opModes
    let opMode;
    switch (value) {
      case TargetHeaterCoolerState.AUTO:
        opMode = OpMode.AUTO; // LG's AUTO mode = 6
        break;
      case TargetHeaterCoolerState.HEAT:
        opMode = OpMode.HEAT; // LG's HEAT mode = 4
        break;
      case TargetHeaterCoolerState.COOL:
        opMode = OpMode.COOL; // LG's COOL mode = 0
        break;
      default:
        opMode = this.Status.opMode; // Keep current mode
    }

    if (opMode !== this.Status.opMode) {
      await this.setOpMode(opMode);
    }
  }

  async setActive(value: CharacteristicValue) {
    const device: Device = this.accessory.context.device;
    const isOn = value as boolean ? 1 : 0;
    this.platform.log.debug('Set power on = ', isOn, ' - current status = ', this.Status.isPowerOn);
    if (this.Status.isPowerOn && isOn) {
      return; // don't send same status
    }

    this.platform.ThinQ?.deviceControl(device.id, {
      dataKey: 'airState.operation',
      dataValue: isOn as number,
    }, 'Operation').then(success => {
      if (success) {
        device.data.snapshot['airState.operation'] = isOn;
      }

      this.updateAccessoryCharacteristic(device);
    });
  }

  async setTargetTemperature(value: CharacteristicValue) {
    if (!this.Status.isPowerOn) {
      return;
    }

    const device: Device = this.accessory.context.device;

    const temperature = this.Status.convertTemperatureCelsiusFromHomekitToLG(value);
    if (temperature === this.Status.targetTemperature) {
      return;
    }

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
    const windStrength = parseInt(Object.keys(FanSpeed)[speedValue - 1]) || FanSpeed.HIGH;
    this.platform.ThinQ?.deviceControl(device.id, {
      dataKey: 'airState.windStrength',
      dataValue: windStrength,
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
    this.platform.ThinQ?.deviceControl(device.id, {
      dataKey: 'airState.opMode',
      dataValue: opMode,
    });
  }

  protected isJetModeEnabled(device: Device) {
    return this.jetModeModels.includes(device.model); // cool mode only
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
      .onGet(() => {
        return this.Status.isPowerOn ? Characteristic.Active.ACTIVE : Characteristic.Active.INACTIVE;
      })
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
      .onSet(this.setFanState.bind(this));
    this.serviceFanV2.getCharacteristic(Characteristic.RotationSpeed)
      .setProps({
        minValue: 0,
        maxValue: Object.keys(FanSpeed).length / 2,
        minStep: 0.1,
      })
      .updateValue(this.Status.windStrength)
      .onSet(this.setFanSpeed.bind(this));

    // Only add the SwingMode characteristic if swing mode is not set to NONE
    if (this.config.ac_swing_mode !== 'NONE') {
      this.serviceFanV2.getCharacteristic(Characteristic.SwingMode)
        .onSet(this.setSwingMode.bind(this))
        .updateValue(this.Status.isSwingOn ? Characteristic.SwingMode.SWING_ENABLED : Characteristic.SwingMode.SWING_DISABLED);
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
      .updateValue(Characteristic.Active.INACTIVE)
      .onGet(() => {
        // Force "No Response" state when device is offline
        if (!device.online) {
          throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
        }
        return this.Status.isPowerOn ? Characteristic.Active.ACTIVE : Characteristic.Active.INACTIVE;
      })
      .onSet(this.setActive.bind(this));
    this.service.getCharacteristic(Characteristic.CurrentHeaterCoolerState)
      .onGet(() => {
        // Force "No Response" state when device is offline
        if (!device.online) {
          throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
        }
        if (!this.Status.isPowerOn) {
          return Characteristic.CurrentHeaterCoolerState.INACTIVE;
        } else if ([OpMode.COOL].includes(this.Status.opMode)) {
          return Characteristic.CurrentHeaterCoolerState.COOLING;
        } else if ([OpMode.HEAT].includes(this.Status.opMode)) {
          return Characteristic.CurrentHeaterCoolerState.HEATING;
        } else if ([OpMode.AUTO, -1].includes(this.Status.opMode)) {
          if (this.Status.currentTemperature < this.Status.targetTemperature) {
            return Characteristic.CurrentHeaterCoolerState.HEATING;
          } else {
            return Characteristic.CurrentHeaterCoolerState.COOLING;
          }
        }
        return Characteristic.CurrentHeaterCoolerState.INACTIVE;
      })
      .updateValue(Characteristic.CurrentHeaterCoolerState.INACTIVE);

    if (this.config.ac_mode === 'BOTH') {
      this.service.getCharacteristic(Characteristic.TargetHeaterCoolerState)
        .setProps({
          validValues: [
            Characteristic.TargetHeaterCoolerState.AUTO,
            Characteristic.TargetHeaterCoolerState.COOL,
            Characteristic.TargetHeaterCoolerState.HEAT,
          ],
        })
        .onGet(() => {
          // Force "No Response" state when device is offline
          if (!device.online) {
            throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
          }
          return this.service.getCharacteristic(Characteristic.TargetHeaterCoolerState).value;
        })
        .updateValue(Characteristic.TargetHeaterCoolerState.COOL);
    } else if (this.config.ac_mode === 'COOLING') {
      this.service.getCharacteristic(Characteristic.TargetHeaterCoolerState)
        .setProps({
          validValues: [
            Characteristic.TargetHeaterCoolerState.COOL,
          ],
        })
        .onGet(() => {
          // Force "No Response" state when device is offline
          if (!device.online) {
            throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
          }
          return Characteristic.TargetHeaterCoolerState.COOL;
        })
        .updateValue(Characteristic.TargetHeaterCoolerState.COOL);
    } else if (this.config.ac_mode === 'HEATING') {
      this.service.getCharacteristic(Characteristic.TargetHeaterCoolerState)
        .setProps({
          validValues: [
            Characteristic.TargetHeaterCoolerState.HEAT,
          ],
        })
        .onGet(() => {
          // Force "No Response" state when device is offline
          if (!device.online) {
            throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
          }
          return Characteristic.TargetHeaterCoolerState.HEAT;
        })
        .updateValue(Characteristic.TargetHeaterCoolerState.HEAT);
    }

    this.service.getCharacteristic(Characteristic.TargetHeaterCoolerState)
      .onSet(this.setTargetState.bind(this));

    if (this.Status.currentTemperature) {
      this.service.updateCharacteristic(Characteristic.CurrentTemperature, this.Status.currentTemperature);
    }

    /**
     * DHW 15 - 80: support.airState.tempState.waterTempHeatMin - support.airState.tempState.waterTempHeatMax
     * heating 15 - 65:
     * cooling 5 - 27: support.airState.tempState.waterTempCoolMin - support.airState.tempState.waterTempCoolMax
     */
    const currentTemperatureValue = device.deviceModel.value('airState.tempState.current') as RangeValue;
    if (currentTemperatureValue) {
      this.service.getCharacteristic(Characteristic.CurrentTemperature)
        .setProps({
          minValue: this.Status.convertTemperatureCelsiusFromLGToHomekit(currentTemperatureValue.min),
          maxValue: this.Status.convertTemperatureCelsiusFromLGToHomekit(currentTemperatureValue.max),
          minStep: 0.01,
        })
        .onGet(() => {
          // Force "No Response" state when device is offline
          if (!device.online) {
            throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
          }
          return this.Status.currentTemperature;
        });
    }

    let heatLowLimitKey, heatHighLimitKey, coolLowLimitKey, coolHighLimitKey;

    if (this.Status.type === ACModelType.AWHP) {
      heatLowLimitKey = 'support.airState.tempState.waterTempHeatMin';
      heatHighLimitKey = 'support.airState.tempState.waterTempHeatMax';
      coolLowLimitKey = 'support.airState.tempState.waterTempCoolMin';
      coolHighLimitKey = 'support.airState.tempState.waterTempCoolMax';
    } else {
      heatLowLimitKey = 'support.heatLowLimit';
      heatHighLimitKey = 'support.heatHighLimit';
      coolLowLimitKey = 'support.coolLowLimit';
      coolHighLimitKey = 'support.coolHighLimit';
    }

    const targetTemperature = (minRange, maxRange): RangeValue => {
      let temperature: RangeValue = {
        type: ValueType.Range,
        min: 0,
        max: 0,
        step: 0.01,
      };

      if (minRange && maxRange) {
        const minRangeOptions: number[] = Object.values(minRange.options);
        const maxRangeOptions: number[] = Object.values(maxRange.options);
        if (minRangeOptions.length > 1) {
          temperature.min = Math.min(...minRangeOptions.filter(v => v !== 0));
        }
        if (maxRangeOptions.length > 1) {
          temperature.max = Math.max(...maxRangeOptions.filter(v => v !== 0));
        }
      }

      if (!temperature || !temperature.min || !temperature.max) {
        temperature = device.deviceModel.value('airState.tempState.limitMin') as RangeValue;
      }

      if (!temperature || !temperature.min || !temperature.max) {
        temperature = device.deviceModel.value('airState.tempState.target') as RangeValue;
      }

      return temperature;
    };

    const tempHeatMinRange = device.deviceModel.value(heatLowLimitKey) as EnumValue;
    const tempHeatMaxRange = device.deviceModel.value(heatHighLimitKey) as EnumValue;
    const targetHeatTemperature = targetTemperature(tempHeatMinRange, tempHeatMaxRange);

    if (targetHeatTemperature) {
      const minHeatTemp = Math.max(16, this.Status.convertTemperatureCelsiusFromLGToHomekit(targetHeatTemperature.min));
      this.service.getCharacteristic(Characteristic.HeatingThresholdTemperature)
        .setProps({
          minValue: minHeatTemp,
          maxValue: this.Status.convertTemperatureCelsiusFromLGToHomekit(targetHeatTemperature.max),
          minStep: targetHeatTemperature.step || 0.01,
        })
        .onGet(() => {
          // Force "No Response" state when device is offline
          if (!device.online) {
            throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
          }
          return this.Status.targetTemperature;
        })
        .updateValue(minHeatTemp); // Ensure we use a valid value
    }

    const tempCoolMinRange = device.deviceModel.value(coolLowLimitKey) as EnumValue;
    const tempCoolMaxRange = device.deviceModel.value(coolHighLimitKey) as EnumValue;
    const targetCoolTemperature = targetTemperature(tempCoolMinRange, tempCoolMaxRange);

    if (targetCoolTemperature) {
      const minCoolTemp = Math.max(20, this.Status.convertTemperatureCelsiusFromLGToHomekit(targetCoolTemperature.min));
      this.service.getCharacteristic(Characteristic.CoolingThresholdTemperature)
        .setProps({
          minValue: minCoolTemp,
          maxValue: this.Status.convertTemperatureCelsiusFromLGToHomekit(targetCoolTemperature.max),
          minStep: targetHeatTemperature.step || 0.01,
        })
        .onGet(() => {
          // Force "No Response" state when device is offline
          if (!device.online) {
            throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
          }
          return this.Status.targetTemperature;
        })
        .updateValue(minCoolTemp); // Ensure we use a valid value
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
      .onGet(() => {
        // Force "No Response" state when device is offline
        if (!device.online) {
          throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
        }
        return this.Status.windStrength;
      })
      .onSet(this.setFanSpeed.bind(this));

    // Only add the SwingMode characteristic if swing mode is not set to NONE
    if (this.config.ac_swing_mode !== 'NONE') {
      this.service.getCharacteristic(Characteristic.SwingMode)
        .onGet(() => {
          // Force "No Response" state when device is offline
          if (!device.online) {
            throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
          }
          return this.Status.isSwingOn ? Characteristic.SwingMode.SWING_ENABLED : Characteristic.SwingMode.SWING_DISABLED;
        })
        .onSet(this.setSwingMode.bind(this));
    }
  }

  public setupButton(device: Device) {
    if (!this.config.ac_buttons.length) {
      return;
    }

    this.serviceLabelButtons = this.accessory.getService('Buttons')
      || this.accessory.addService(this.platform.Service.ServiceLabel, 'Buttons', 'Buttons');

    // remove all buttons before
    for (let i=0; i<this.serviceLabelButtons.linkedServices.length; i++){
      this.accessory.removeService(this.serviceLabelButtons.linkedServices[i]);
    }

    for (let i = 0; i < this.config.ac_buttons.length; i++) {
      this.setupButtonOpmode(device, this.config.ac_buttons[i].name, parseInt(this.config.ac_buttons[i].op_mode));
    }
  }

  protected setupButtonOpmode(device: Device, name, opMode) {
    const {
      Service: {
        Switch,
      },
      Characteristic,
    } = this.platform;

    const serviceButton = this.accessory.getService(name) || this.accessory.addService(Switch, name, name);
    serviceButton.updateCharacteristic(this.platform.Characteristic.Name, name);
    serviceButton.getCharacteristic(this.platform.Characteristic.On)
      .onGet(() => {
        return this.Status.opMode === opMode;
      })
      .onSet(async (value: CharacteristicValue) => {
        if (value as boolean) {
          if (this.Status.opMode !== opMode) {
            await this.setOpMode(opMode).then(() => {
              device.data.snapshot['airState.opMode'] = opMode;
              this.updateAccessoryCharacteristic(device);
            });
          }
        } else {
          await this.setOpMode(OpMode.COOL).then(async () => {
            device.data.snapshot['airState.opMode'] = OpMode.COOL;
            this.updateAccessoryCharacteristic(device);
            await this.setTargetState(this.currentTargetState);
          });
        }
      });

    serviceButton.addOptionalCharacteristic(Characteristic.ConfiguredName);
    if (!serviceButton.getCharacteristic(Characteristic.ConfiguredName).value) {
      serviceButton.updateCharacteristic(Characteristic.ConfiguredName, name);
    }

    this.serviceLabelButtons.addLinkedService(serviceButton);
  }
}

export class ACStatus {
  constructor(protected data, protected device: Device, protected config) {
  }

  /**
   * detect fahrenheit unit device by country code
   * list: us
   */
  public get isFahrenheitUnit() {
    return this.config?.ac_temperature_unit?.toLowerCase() === 'f';
  }

  public convertTemperatureCelsiusFromHomekitToLG(temperatureInCelsius) {
    if (!this.isFahrenheitUnit) {
      return temperatureInCelsius;
    }

    const temperatureInFahrenheit = Math.round(cToF(temperatureInCelsius)); // convert temperature to fahrenheit by normal algorithm

    // lookup celsius value by fahrenheit value from table TempFahToCel
    const temperature = this.device.deviceModel.lookupMonitorValue('TempFahToCel', temperatureInFahrenheit.toString());

    if (temperature === undefined) {
      return temperatureInCelsius;
    }

    return temperature;
  }

  /**
   * algorithm conversion LG vs Homekit is different
   * so we need to handle it before submit to homekit
   */
  public convertTemperatureCelsiusFromLGToHomekit(temperatureInCelsius) {
    if (!this.isFahrenheitUnit) {
      return temperatureInCelsius;
    }

    // lookup fahrenheit value by celsius value from table TempCelToFah
    let temperatureInFahrenheit = parseInt(this.device.deviceModel.lookupMonitorValue('TempCelToFah', temperatureInCelsius));
    if (isNaN(temperatureInFahrenheit)) {
      // lookup again in table TempFahToCel
      temperatureInFahrenheit = parseInt(this.device.deviceModel.lookupMonitorValue('TempFahToCel', temperatureInCelsius));
    }

    // if not found in both tables, return original value
    if (isNaN(temperatureInFahrenheit)) {
      return temperatureInCelsius;
    }

    // convert F to C, truncate number to 2 decimal places without rounding
    // custom fToC function, original in helper.ts
    const celsius = parseFloat(String((temperatureInFahrenheit - 32) * 5 / 9));
    const withoutRounded = celsius.toString().match(/^-?\d+(?:\.\d{0,2})?/);
    if (withoutRounded) {
      return parseFloat(withoutRounded[0]);
    }

    return celsius.toFixed(2);
  }

  public get opMode() {
    return this.data['airState.opMode'] as number;
  }

  public get isPowerOn() {
    return !!this.data['airState.operation'] as boolean;
  }

  public get currentRelativeHumidity() {
    const humidity = parseInt(this.data['airState.humidity.current']);
    if (humidity > 100) {
      return humidity / 10;
    }

    return humidity;
  }

  public get currentTemperature() {
    return this.convertTemperatureCelsiusFromLGToHomekit(this.data['airState.tempState.current'] as number);
  }

  public get targetTemperature() {
    return this.convertTemperatureCelsiusFromLGToHomekit(this.data['airState.tempState.target'] as number);
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

  public get currentConsumption() {
    const consumption = parseInt(this.data['airState.energy.onCurrent']);
    if (isNaN(consumption)) {
      return 0;
    }

    return consumption / 100;
  }

  public get type() {
    return this.device.deviceModel.data.Info.modelType || ACModelType.RAC;
  }
}