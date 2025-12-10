import { AccessoryContext, BaseDevice } from '../baseDevice.js';
import { LGThinQHomebridgePlatform } from '../platform.js';
import { CharacteristicValue, Logger, PlatformAccessory, Service } from 'homebridge';
import { Device } from '../lib/Device.js';
import { EnumValue, RangeValue, ValueType } from '../lib/DeviceModel.js';
import { cToF, fToC } from '../helper.js';

export enum ACModelType {
  AWHP = 'AWHP',
  RAC = 'RAC',
}

export const FAN_SPEED_AUTO = 8;

export enum FanSpeed {
  LOW = 2,
  LOW_MEDIUM = 3,
  MEDIUM = 4,
  MEDIUM_HIGH = 5,
  HIGH = 6
}

enum OpMode {
  AUTO = 6,
  COOL = 0,
  HEAT = 4,
  FAN = 2,
  DRY = 1,
  AIR_CLEAN = 5,
}

export type Config = {
  ac_swing_mode: string,
  ac_air_quality: boolean,
  ac_mode: string,
  ac_temperature_sensor: boolean,
  ac_humidity_sensor: boolean,
  ac_led_control: boolean,
  ac_fan_control: boolean,
  ac_jet_control: boolean,
  ac_temperature_unit: string,
  ac_buttons: { name: string, op_mode: string }[],
  ac_air_clean: boolean,
  ac_energy_save: boolean,
}


/**
 * Represents an LG ThinQ Air Conditioner device.
 * This class extends the `baseDevice` class and provides functionality to control and monitor
 * various features of an air conditioner, such as temperature, fan speed, swing mode, and more.
 */
export default class AirConditioner extends BaseDevice {
  protected service: Service;
  protected serviceAirQuality: Service | undefined;
  protected serviceSensor: Service | undefined;
  protected serviceHumiditySensor: Service | undefined;
  protected serviceLight: Service | undefined;
  protected serviceFanV2: Service | undefined;

  // more feature
  protected serviceJetMode: Service | undefined; // jet mode
  protected serviceQuietMode: Service | undefined;
  protected serviceEnergySaveMode: Service | undefined;
  protected serviceAirClean: Service | undefined;
  protected jetModeModels = ['RAC_056905'];
  protected quietModeModels = ['WINF_056905'];
  protected energySaveModeModels = ['WINF_056905', 'RAC_056905'];
  protected airCleanModels = ['RAC_056905'];
  protected currentTargetState = 2; // default target: COOL

  protected serviceLabelButtons: Service | undefined;

  constructor(
    public readonly platform: LGThinQHomebridgePlatform,
    public readonly accessory: PlatformAccessory<AccessoryContext>,
    logger: Logger,
  ) {
    super(platform, accessory, logger);

    const device: Device = this.accessory.context.device;

    const {
      Service: {
        TemperatureSensor,
        HumiditySensor,
        Switch,
        Lightbulb,
        HeaterCooler,
      },
    } = this.platform;
    this.service = this.accessory.getService(HeaterCooler) || this.accessory.addService(HeaterCooler, device.name);

    this.createHeaterCoolerService();
    this.service.addOptionalCharacteristic(this.platform.customCharacteristics.TotalConsumption);

    if (this.config.ac_air_quality as boolean && this.Status.airQuality) {
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
      this.serviceSensor = undefined;
    }

    this.serviceHumiditySensor = accessory.getService(HumiditySensor);
    if (this.config.ac_humidity_sensor as boolean) {
      this.serviceHumiditySensor = this.serviceHumiditySensor || accessory.addService(HumiditySensor);
      this.serviceHumiditySensor.updateCharacteristic(platform.Characteristic.StatusActive, false);
      this.serviceSensor?.addLinkedService(this.service);
    } else if (this.serviceHumiditySensor) {
      accessory.removeService(this.serviceHumiditySensor);
      this.serviceHumiditySensor = undefined;
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
      this.serviceLight = undefined;
    }

    if (this.config.ac_fan_control as boolean) {
      this.createFanService();
    } else if (this.serviceFanV2) {
      accessory.removeService(this.serviceFanV2);
    }

    // more feature
    if (this.config.ac_jet_control as boolean && this.isJetModeEnabled(device.model)) {
      this.serviceJetMode = accessory.getService('Jet Mode') || accessory.addService(Switch, 'Jet Mode', 'Jet Mode');
      this.serviceJetMode.addOptionalCharacteristic(platform.Characteristic.ConfiguredName);
      this.serviceJetMode.setCharacteristic(platform.Characteristic.ConfiguredName, device.name + ' Jet Mode');
      this.serviceJetMode.getCharacteristic(platform.Characteristic.On)
        .onSet(this.setJetModeActive.bind(this));
    } else if (this.serviceJetMode) {
      accessory.removeService(this.serviceJetMode);
      this.serviceJetMode = undefined;
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
        this.serviceEnergySaveMode.addOptionalCharacteristic(platform.Characteristic.ConfiguredName);
        this.serviceEnergySaveMode.setCharacteristic(platform.Characteristic.ConfiguredName, device.name + ' Energy save');
      }
      this.serviceEnergySaveMode.getCharacteristic(platform.Characteristic.On)
        .onSet(this.setEnergySaveActive.bind(this));
    } else if (this.serviceEnergySaveMode) {
      accessory.removeService(this.serviceEnergySaveMode);
      this.serviceEnergySaveMode = undefined;
    }

    this.serviceAirClean = accessory.getService('Air Purify');
    if (this.airCleanModels.includes(device.model) && this.config.ac_air_clean as boolean) {
      if (!this.serviceAirClean) {
        this.serviceAirClean = accessory.addService(Switch, 'Air Purify', 'Air Purify');
        this.serviceAirClean.addOptionalCharacteristic(platform.Characteristic.ConfiguredName);
        this.serviceAirClean.setCharacteristic(platform.Characteristic.ConfiguredName, device.name + ' Air Purify');
      }
      this.serviceAirClean.getCharacteristic(platform.Characteristic.On)
        .onSet(this.setAirCleanActive.bind(this));
    } else if (this.serviceAirClean) {
      accessory.removeService(this.serviceAirClean);
      this.serviceAirClean = undefined;
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

          this.serviceFanV2?.updateCharacteristic(Characteristic.Active, this.Status.isPowerOn ? Characteristic.Active.ACTIVE : Characteristic.Active.INACTIVE);
          this.serviceFanV2?.updateCharacteristic(Characteristic.RotationSpeed, this.Status.windStrength);
        }, 100);
      })
      .updateValue(Characteristic.Active.INACTIVE);

    this.serviceFanV2.addOptionalCharacteristic(Characteristic.ConfiguredName);
    this.serviceFanV2.setCharacteristic(Characteristic.ConfiguredName, device.name + ' Fan');
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
    const device: Device = this.accessory.context.device;
    const { Characteristic } = this.platform;
    this.service.setCharacteristic(Characteristic.Name, device.name);
    this.service.getCharacteristic(Characteristic.Active)
      .onSet(this.setActive.bind(this));
    this.service.getCharacteristic(Characteristic.CurrentHeaterCoolerState);

    if (this.config.ac_mode === 'BOTH') {
      this.service.getCharacteristic(Characteristic.TargetHeaterCoolerState)
        .setProps({
          validValues: [
            Characteristic.TargetHeaterCoolerState.AUTO,
            Characteristic.TargetHeaterCoolerState.COOL,
            Characteristic.TargetHeaterCoolerState.HEAT,
          ],
        })
        .updateValue(Characteristic.TargetHeaterCoolerState.COOL);
    } else if (this.config.ac_mode === 'COOLING') {
      this.service.getCharacteristic(Characteristic.TargetHeaterCoolerState)
        .setProps({
          validValues: [
            Characteristic.TargetHeaterCoolerState.COOL,
          ],
        })
        .updateValue(Characteristic.TargetHeaterCoolerState.COOL);
    } else if (this.config.ac_mode === 'HEATING') {
      this.service.getCharacteristic(Characteristic.TargetHeaterCoolerState)
        .setProps({
          validValues: [
            Characteristic.TargetHeaterCoolerState.HEAT,
          ],
        })
        .updateValue(Characteristic.TargetHeaterCoolerState.HEAT);
    }

    this.service.getCharacteristic(Characteristic.TargetHeaterCoolerState)
      .onSet(this.setTargetState.bind(this));

    const status = this.Status;
    if (status.currentTemperature) {
      this.service.updateCharacteristic(Characteristic.CurrentTemperature, status.currentTemperature);
    }

    this.service.getCharacteristic(Characteristic.CurrentTemperature);


    const targetHeatTemperature = status.getTemperatureRange(status.getTemperatureRangeForHeating());

    if (targetHeatTemperature) {
      this.service.getCharacteristic(Characteristic.HeatingThresholdTemperature)
        .setProps({
          minValue: status.convertTemperatureCelsiusFromLGToHomekit(targetHeatTemperature.min),
          maxValue: status.convertTemperatureCelsiusFromLGToHomekit(targetHeatTemperature.max),
          minStep: targetHeatTemperature.step || 0.01,
        });
    }

    const targetCoolTemperature = status.getTemperatureRange(status.getTemperatureRangeForCooling());

    if (targetCoolTemperature) {
      this.service.getCharacteristic(Characteristic.CoolingThresholdTemperature)
        .setProps({
          minValue: status.convertTemperatureCelsiusFromLGToHomekit(targetCoolTemperature.min),
          maxValue: status.convertTemperatureCelsiusFromLGToHomekit(targetCoolTemperature.max),
          minStep: targetCoolTemperature.step || 0.01,
        });
    }

    this.service.getCharacteristic(Characteristic.CoolingThresholdTemperature)
      .onSet(this.setTargetTemperature.bind(this));
    this.service.getCharacteristic(Characteristic.HeatingThresholdTemperature)
      .onSet(this.setTargetTemperature.bind(this));

    if (!this.config.ac_fan_control) {
      this.service.getCharacteristic(Characteristic.RotationSpeed)
        .setProps({
          minValue: 0,
          maxValue: Object.keys(FanSpeed).length / 2,
          minStep: 0.1,
        })
        .onSet(this.setFanSpeed.bind(this));
    }
    this.service.getCharacteristic(Characteristic.SwingMode)
      .onSet(this.setSwingMode.bind(this));
  }


  public get config(): Config {
    return {
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
      ...super.config,
    };
  }

  public get Status() {
    return new ACStatus(this.accessory.context.device.snapshot, this.accessory.context.device, this.config, this.logger);
  }

  /**
   * Sets the energy-saving mode for the air conditioner.
   *
   * @param value - A boolean indicating whether to enable or disable energy-saving mode.
   */
  async setEnergySaveActive(value: CharacteristicValue) {
    const device: Device = this.accessory.context.device;
    if (typeof value !== 'boolean') {
      this.logger.error('Invalid value for energy save mode:', value);
      return;
    }
    const status = this.Status;
    if (!(status.isPowerOn && status.opMode === 0)) {
      this.logger.debug(`Energy save mode is not supported in the current state. Power: ${status.isPowerOn}, Mode: ${status.opMode}`);
      return;
    }
    try {
      await this.platform.ThinQ?.deviceControl(device.id, {
        dataKey: 'airState.powerSave.basic',
        dataValue: value ? 1 : 0,
      });
      this.accessory.context.device.data.snapshot['airState.powerSave.basic'] = value ? 1 : 0;
      this.updateAccessoryenergySaveModeModelsCharacteristic();
    } catch (error) {
      this.logger.error('Error setting energy save mode:', error);
    }
  }

  /**
   * Sets the air purification mode for the air conditioner.
   *
   * @param value - A boolean indicating whether to enable or disable air purification mode.
   */
  async setAirCleanActive(value: CharacteristicValue) {
    const device: Device = this.accessory.context.device;
    const status = this.Status;
    if (typeof value !== 'boolean') {
      this.logger.error('Invalid value for air clean mode:', value);
      return;
    }
    if (!(status.isPowerOn && status.opMode === 0)) {
      this.logger.debug(`Air clean mode is not supported in the current state. Power: ${status.isPowerOn}, Mode: ${status.opMode}`);
      return;
    }
    try {
      await this.platform.ThinQ?.deviceControl(device.id, {
        dataKey: 'airState.wMode.airClean',
        dataValue: value ? 1 : 0,
      });
      this.accessory.context.device.data.snapshot['airState.wMode.airClean'] = value ? 1 : 0;
      this.updateAccessoryairCleanModelsCharacteristic();
    } catch (error) {
      this.logger.error('Error setting air clean mode:', error);
    }
  }

  /**
   * Sets the quiet mode for the air conditioner.
   *
   * @param value - A boolean indicating whether to enable or disable quiet mode.
   */
  async setQuietModeActive(value: CharacteristicValue) {
    const device: Device = this.accessory.context.device;
    if (typeof value !== 'boolean') {
      this.logger.error('Invalid value for quiet mode:', value);
      return;
    }
    const status = this.Status;
    if (!(status.isPowerOn && status.opMode === 0)) {
      this.logger.debug(`Quiet mode is not supported in the current state. Power: ${status.isPowerOn}, Mode: ${status.opMode}`);
      return;
    }
    try {
      await this.platform.ThinQ?.deviceControl(device.id, {
        dataKey: 'airState.miscFuncState.silentAWHP',
        dataValue: value ? 1 : 0,
      });
      this.accessory.context.device.data.snapshot['airState.miscFuncState.silentAWHP'] = value ? 1 : 0;
      this.updateAccessoryquietModeModelsCharacteristic();
    } catch (error) {
      this.logger.error('Error setting quiet mode:', error);
    }
  }

  /**
   * Sets the jet mode active state for the air conditioner device.
   *
   * @param value - The desired state of jet mode, where `true` activates jet mode and `false` deactivates it.
   * @returns The resulting state of jet mode after the operation.
   *
   * @remarks
   * - Jet mode can only be activated if the device is powered on and the operation mode (`opMode`) is set to 0.
   * - If the operation fails, an error is logged, and the method returns the opposite state of the requested value.
   * - If jet mode is not supported in the current state, the method logs a debug message and returns `INACTIVE`.
   *
   * @throws Logs an error if there is an issue with the device control operation.
   */
  async setJetModeActive(value: CharacteristicValue) {
    const device: Device = this.accessory.context.device;
    if (typeof value !== 'boolean') {
      this.logger.error('Invalid value for jet mode:', value);
      return;
    }
    const status = this.Status;
    if (!(status.isPowerOn && status.opMode === 0)) {
      this.logger.debug(`Jet mode is not supported in the current state. Power: ${status.isPowerOn}, Mode: ${status.opMode}`);
      return;
    }
    try {
      await this.platform.ThinQ?.deviceControl(device.id, {
        dataKey: 'airState.wMode.jet',
        dataValue: value ? 1 : 0,
      });
      this.accessory.context.device.data.snapshot['airState.wMode.jet'] = value ? 1 : 0;
      this.updateAccessoryJetModeCharacteristic();
    } catch (error) {
      this.logger.error('Error setting jet mode:', error);
    }
  }

  /**
   * Sets the fan state of the air conditioner to either AUTO or MANUAL mode.
   *
   * @param value - The desired fan state, represented as a `CharacteristicValue`.
   *                It can be either `TargetFanState.AUTO` or `TargetFanState.MANUAL`.
   * @returns The updated fan state, which will match the input value if the operation succeeds,
   *          or the opposite state if the operation fails or the power is off.
   *
   * @remarks
   * - If the air conditioner is powered off, the method logs a debug message and returns
   *   the opposite of the requested fan state.
   * - If the air conditioner is powered on, it attempts to update the fan state via the
   *   ThinQ API. On success, the fan state is updated in the device's context. On failure,
   *   an error is logged, and the opposite fan state is returned.
   * - The AUTO mode corresponds to a wind strength value of 8, while MANUAL mode corresponds
   *   to a high fan speed.
   *
   * @throws This method does not throw errors directly but logs them if the ThinQ API call fails.
   */
  async setFanState(value: CharacteristicValue) {
    const status = this.Status;
    if (!status.isPowerOn) {
      this.logger.debug('Power is off, cannot set fan state');
      return;
    }
    const device: Device = this.accessory.context.device;
    const { TargetFanState } = this.platform.Characteristic;
    try {
      const windStrength = (value === TargetFanState.AUTO) ? FAN_SPEED_AUTO : FanSpeed.HIGH;
      await this.platform.ThinQ?.deviceControl(device.id, {
        dataKey: 'airState.windStrength',
        dataValue: windStrength,
      });
      this.accessory.context.device.data.snapshot['airState.windStrength'] = windStrength;
      this.updateAccessoryFanStateCharacteristics();
      this.updateAccessoryFanV2Characteristic();
    } catch (error) {
      this.logger.error('Error setting fan state:', error);
    }
  }


  /**
   * Updates the accessory characteristics based on the current device state.
   *
   * @param device - The device object containing the current state.
   */
  public updateAccessoryCharacteristic(device: Device) {
    super.updateAccessoryCharacteristic(device);
    this.updateAccessoryActiveCharacteristic();
    this.updateAccessoryCurrentTemperatureCharacteristic();
    this.updateAccessoryStateCharacteristics();
    this.updateAccessoryTemperatureCharacteristics();
    this.updateAccessoryFanStateCharacteristics();
    this.updateAccessoryTotalConsumptionCharacteristic();
    this.updateAccessoryAirQualityCharacteristic();
    this.updateAccessoryTemperatureSensorCharacteristic();
    this.updateAccessoryHumiditySensorCharacteristic();
    this.updateAccessoryFanV2Characteristic();
    this.updateAccessoryLedControlCharacteristic();
    this.updateAccessoryJetModeCharacteristic();
    this.updateAccessoryquietModeModelsCharacteristic();
    this.updateAccessoryenergySaveModeModelsCharacteristic();
    this.updateAccessoryairCleanModelsCharacteristic();
  }

  /**
   * Updates the "Active" characteristic of the accessory's service to reflect the current power status.
   * 
   * This method checks the power status of the device (`isPowerOn`) and updates the "Active" characteristic
   * accordingly. If the device is powered on, the characteristic is set to `ACTIVE`, otherwise it is set to `INACTIVE`.
   */
  public updateAccessoryActiveCharacteristic() {
    this.service.updateCharacteristic(this.platform.Characteristic.Active,
      this.Status.isPowerOn ? this.platform.Characteristic.Active.ACTIVE : this.platform.Characteristic.Active.INACTIVE);
  }

  /**
   * Updates the `CurrentTemperature` characteristic of the accessory's service
   * with the current temperature value from the device's status.
   *
   * This method ensures that the Homebridge platform reflects the most recent
   * temperature reading from the air conditioner.
   */
  public updateAccessoryCurrentTemperatureCharacteristic() {
    this.service.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, this.Status.currentTemperature);
  }

  /**
   * Updates the state characteristics of the accessory based on the current status of the air conditioner.
   * 
   * This method synchronizes the accessory's characteristics with the current operational state of the air conditioner,
   * including power status, operating mode, and temperature settings. It updates the `CurrentHeaterCoolerState` and 
   * `TargetHeaterCoolerState` characteristics accordingly.
   * 
   * Behavior:
   * - If the air conditioner is powered off, the state is set to `INACTIVE`.
   * - If the operating mode is `COOL`, the state is set to `COOLING` and the target state to `COOL`.
   * - If the operating mode is `HEAT`, the state is set to `HEATING` and the target state to `HEAT`.
   * - If the operating mode is `AUTO` or undefined (`-1`), the state is determined based on the current and target temperatures:
   *   - If the current temperature is below the target temperature, the state is set to `HEATING` and the target state to `HEAT`.
   *   - Otherwise, the state is set to `COOLING` and the target state to `COOL`.
   * - For other modes, no specific behavior is defined.
   * 
   * @remarks
   * This method assumes that the `Status` object contains the necessary properties (`isPowerOn`, `opMode`, `currentTemperature`, 
   * and `targetTemperature`) and that the `service` object provides the `updateCharacteristic` method.
   */
  public updateAccessoryStateCharacteristics() {
    if (!this.Status.isPowerOn) {
      this.service.updateCharacteristic(this.platform.Characteristic.CurrentHeaterCoolerState,
        this.platform.Characteristic.CurrentHeaterCoolerState.INACTIVE);
    } else if (this.Status.opMode === OpMode.COOL) {
      this.service.updateCharacteristic(this.platform.Characteristic.CurrentHeaterCoolerState,
        this.platform.Characteristic.CurrentHeaterCoolerState.COOLING);
      this.service.updateCharacteristic(this.platform.Characteristic.TargetHeaterCoolerState,
        this.platform.Characteristic.TargetHeaterCoolerState.COOL);
    } else if (this.Status.opMode === OpMode.HEAT) {
      this.service.updateCharacteristic(this.platform.Characteristic.CurrentHeaterCoolerState,
        this.platform.Characteristic.CurrentHeaterCoolerState.HEATING);
      this.service.updateCharacteristic(this.platform.Characteristic.TargetHeaterCoolerState,
        this.platform.Characteristic.TargetHeaterCoolerState.HEAT);
    } else if ([OpMode.AUTO, -1].includes(this.Status.opMode)) {
      // auto mode, detect based on current & target temperature
      if (this.Status.currentTemperature < this.Status.targetTemperature) {
        this.service.updateCharacteristic(this.platform.Characteristic.CurrentHeaterCoolerState,
          this.platform.Characteristic.CurrentHeaterCoolerState.HEATING);
        this.service.updateCharacteristic(this.platform.Characteristic.TargetHeaterCoolerState,
          this.platform.Characteristic.TargetHeaterCoolerState.HEAT);
      } else {
        this.service.updateCharacteristic(this.platform.Characteristic.CurrentHeaterCoolerState,
          this.platform.Characteristic.CurrentHeaterCoolerState.COOLING);
        this.service.updateCharacteristic(this.platform.Characteristic.TargetHeaterCoolerState,
          this.platform.Characteristic.TargetHeaterCoolerState.COOL);
      }
    } else {
      // another mode
    }
  }

  /**
   * Updates the accessory's temperature characteristics based on the current state
   * of the heater or cooler. Depending on whether the device is in heating or cooling
   * mode, it updates the corresponding threshold temperature characteristic.
   *
   * - If the current state is `HEATING`, the `HeatingThresholdTemperature` characteristic
   *   is updated with the target temperature.
   * - If the current state is `COOLING`, the `CoolingThresholdTemperature` characteristic
   *   is updated with the target temperature, and a debug log is generated.
   *
   * @remarks
   * This method relies on the `Status.targetTemperature` property to determine the
   * target temperature and the `CurrentHeaterCoolerState` characteristic to determine
   * the current operating mode of the device.
   */
  public updateAccessoryTemperatureCharacteristics() {
    this.logger.warn(`updateAccessoryTemperatureCharacteristics: ${this.accessory.context.device.snapshot['airState.tempState.target']}`);
    this.logger.warn(`updateAccessoryTemperatureCharacteristics: ${this.Status.targetTemperature}`);
    const temperature = this.Status.targetTemperature;
    const currentState = this.service.getCharacteristic(this.platform.Characteristic.CurrentHeaterCoolerState).value;
    if (currentState === this.platform.Characteristic.CurrentHeaterCoolerState.HEATING) {
      this.service.updateCharacteristic(this.platform.Characteristic.HeatingThresholdTemperature, temperature);
    }

    if (currentState === this.platform.Characteristic.CurrentHeaterCoolerState.COOLING) {
      this.logger.debug('Setting cooling target temperature = ', temperature);
      this.service.updateCharacteristic(this.platform.Characteristic.CoolingThresholdTemperature, temperature);
    }
  }

  /**
   * Updates the fan state characteristics of the accessory.
   * 
   * This method updates the `RotationSpeed` and `SwingMode` characteristics
   * of the accessory's service based on the current status of the device.
   * 
   * - `RotationSpeed` is updated using the `windStrength` value from the device status.
   * - `SwingMode` is updated based on whether the swing mode is enabled or disabled.
   * 
   * @remarks
   * The `SwingMode` characteristic is set to `SWING_ENABLED` if the swing mode is on,
   * otherwise it is set to `SWING_DISABLED`.
   */
  public updateAccessoryFanStateCharacteristics() {
    const windStrength = this.Status.windStrength;
    const isSwingOn = this.Status.isSwingOn;
    this.service.updateCharacteristic(this.platform.Characteristic.RotationSpeed, windStrength);
    // eslint-disable-next-line max-len
    this.service.updateCharacteristic(this.platform.Characteristic.SwingMode, isSwingOn ? this.platform.Characteristic.SwingMode.SWING_ENABLED : this.platform.Characteristic.SwingMode.SWING_DISABLED);
  }

  /**
   * Updates the Total Consumption characteristic of the accessory with the current consumption value.
   * This method retrieves the current consumption from the device's status and updates the
   * corresponding custom characteristic in the Homebridge service.
   *
   * @remarks
   * Ensure that the `TotalConsumption` custom characteristic is properly defined in the platform
   * and that the `Status.currentConsumption` value is up-to-date before calling this method.
   */
  public updateAccessoryTotalConsumptionCharacteristic() {
    this.service.updateCharacteristic(this.platform.customCharacteristics.TotalConsumption, this.Status.currentConsumption);
  }

  /**
   * Updates the air quality characteristics of the accessory based on the current air quality status.
   * This method checks if the air quality feature is enabled and updates the corresponding characteristics
   * in the Homebridge service with the current air quality readings.
   *
   * @remarks
   * The method updates the `AirQuality`, `PM2_5Density`, and `PM10Density` characteristics if the air quality
   * data is available and the air quality feature is enabled.
   */
  public updateAccessoryAirQualityCharacteristic() {
    // air quality
    if (this.config.ac_air_quality && this.serviceAirQuality && this.Status.airQuality && this.Status.airQuality.isOn) {
      this.serviceAirQuality.updateCharacteristic(this.platform.Characteristic.AirQuality, this.Status.airQuality.overall);
      if (this.Status.airQuality.PM2) {
        this.serviceAirQuality.updateCharacteristic(this.platform.Characteristic.PM2_5Density, this.Status.airQuality.PM2);
      }

      if (this.Status.airQuality.PM10) {
        this.serviceAirQuality.updateCharacteristic(this.platform.Characteristic.PM10Density, this.Status.airQuality.PM10);
      }
    }
  }

  /**
   * Updates the temperature sensor characteristics of the accessory.
   * 
   * This method checks if the air conditioner temperature sensor is enabled in the configuration
   * and if the temperature sensor service (`serviceSensor`) is available. If both conditions are met,
   * it updates the following characteristics:
   * 
   * - `CurrentTemperature`: Reflects the current temperature reported by the air conditioner.
   * - `StatusActive`: Indicates whether the air conditioner is powered on.
   * 
   * @remarks
   * Ensure that the `config.ac_temperature_sensor` is properly set and that the `serviceSensor` is initialized
   * before calling this method to avoid runtime errors.
   */
  public updateAccessoryTemperatureSensorCharacteristic() {
    if (this.config.ac_temperature_sensor as boolean && this.serviceSensor) {
      this.serviceSensor.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, this.Status.currentTemperature);
      this.serviceSensor.updateCharacteristic(this.platform.Characteristic.StatusActive, this.Status.isPowerOn);
    }
  }

  /**
   * Updates the characteristics of the humidity sensor accessory.
   * 
   * This method updates the `CurrentRelativeHumidity` and `StatusActive` characteristics
   * of the humidity sensor service if the humidity sensor is enabled in the configuration
   * (`ac_humidity_sensor`) and the `serviceHumiditySensor` is defined.
   * 
   * - `CurrentRelativeHumidity` is updated with the current relative humidity value from the device status.
   * - `StatusActive` is updated based on whether the air conditioner is powered on.
   */
  public updateAccessoryHumiditySensorCharacteristic() {
    // humidity sensor
    if (this.config.ac_humidity_sensor as boolean && this.serviceHumiditySensor) {
      this.serviceHumiditySensor.updateCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, this.Status.currentRelativeHumidity);
      this.serviceHumiditySensor.updateCharacteristic(this.platform.Characteristic.StatusActive, this.Status.isPowerOn);
    }
  }

  /**
   * Updates the characteristics of the Fan V2 service for the accessory.
   * 
   * This method synchronizes the accessory's Fan V2 service characteristics with the current
   * status of the air conditioner, including power state, swing mode, wind strength, and
   * whether the fan is in auto or manual mode.
   * 
   * The following characteristics are updated:
   * - `Active`: Indicates whether the fan is active or inactive based on the power state.
   * - `TargetFanState`: Sets the fan state to AUTO or MANUAL depending on the wind strength mode.
   * - `RotationSpeed`: Updates the fan's rotation speed if in manual mode.
   * - `SwingMode`: Indicates whether the swing mode is enabled or disabled.
   * 
   * This method only performs updates if the `ac_fan_control` configuration is enabled and
   * the `serviceFanV2` is defined.
   */
  public updateAccessoryFanV2Characteristic() {
    const status = this.Status;
    const isPowerOn = status.isPowerOn;
    const isSwingOn = status.isSwingOn;
    const windStrength = status.windStrength;
    // handle fan service
    if (this.config.ac_fan_control && this.serviceFanV2) {
      this.serviceFanV2.updateCharacteristic(this.platform.Characteristic.Active,
        isPowerOn ? this.platform.Characteristic.Active.ACTIVE : this.platform.Characteristic.Active.INACTIVE);
      if (status.isWindStrengthAuto) {
        this.serviceFanV2.updateCharacteristic(this.platform.Characteristic.TargetFanState, this.platform.Characteristic.TargetFanState.AUTO);
      } else {
        this.serviceFanV2.updateCharacteristic(this.platform.Characteristic.TargetFanState, this.platform.Characteristic.TargetFanState.MANUAL);
        this.serviceFanV2.updateCharacteristic(this.platform.Characteristic.RotationSpeed, windStrength);
      }
      // eslint-disable-next-line max-len
      this.serviceFanV2.updateCharacteristic(this.platform.Characteristic.SwingMode, isSwingOn ? this.platform.Characteristic.SwingMode.SWING_ENABLED : this.platform.Characteristic.SwingMode.SWING_DISABLED);
    }
  }

  /**
   * Updates the LED control characteristic of the accessory.
   * 
   * This method checks the current status of the accessory's light and updates
   * the corresponding characteristic in the Homebridge service if the LED control
   * configuration is enabled and the serviceLight is defined.
   * 
   * @remarks
   * - The `isLightOn` status is retrieved from the accessory's current status.
   * - The `ac_led_control` configuration determines whether the LED control feature is enabled.
   * - The `serviceLight` represents the Homebridge service responsible for the light characteristic.
   */
  public updateAccessoryLedControlCharacteristic() {
    const isLightOn = this.Status.isLightOn;
    if (this.config.ac_led_control && this.serviceLight) {
      this.serviceLight.updateCharacteristic(this.platform.Characteristic.On, isLightOn);
    }
  }
  public updateAccessoryJetModeCharacteristic() {
    // more feature
    const model = this.accessory.context.device.model;
    if (this.isJetModeEnabled(model) && this.serviceJetMode) {
      this.serviceJetMode.updateCharacteristic(this.platform.Characteristic.On, !!this.accessory.context.device.snapshot['airState.wMode.jet']);
    }
  }
  public updateAccessoryquietModeModelsCharacteristic() {
    const device = this.accessory.context.device;
    const model = device.model;
    if (this.quietModeModels.includes(model) && this.serviceQuietMode) {
      this.serviceQuietMode.updateCharacteristic(this.platform.Characteristic.On, !!device.snapshot['airState.miscFuncState.silentAWHP']);
    }
  }
  public updateAccessoryenergySaveModeModelsCharacteristic() {
    const device = this.accessory.context.device;
    const model = device.model;
    if (this.energySaveModeModels.includes(model) && this.config.ac_energy_save as boolean) {
      this.serviceEnergySaveMode?.updateCharacteristic(this.platform.Characteristic.On, !!device.snapshot['airState.powerSave.basic']);
    }
  }
  public updateAccessoryairCleanModelsCharacteristic() {
    const device = this.accessory.context.device;
    const model = device.model;
    if (this.airCleanModels.includes(model) && this.config.ac_air_clean as boolean) {
      this.serviceAirClean?.updateCharacteristic(this.platform.Characteristic.On, !!device.snapshot['airState.wMode.airClean']);
    }
  }

  async setLight(value: CharacteristicValue) {
    const status = this.Status;
    if (!status.isPowerOn) {
      this.logger.debug('Power is off, cannot set light state');
      return;
    }
    try {
      const device: Device = this.accessory.context.device;
      await this.platform.ThinQ?.deviceControl(device.id, {
        dataKey: 'airState.lightingState.displayControl',
        dataValue: value ? 1 : 0,
      });
      this.accessory.context.device.data.snapshot['airState.lightingState.displayControl'] = value ? 1 : 0;
      this.updateAccessoryLedControlCharacteristic();
    } catch (error) {
      this.logger.error('Error setting light state:', error);
    }

  }

  /**
   * Sets the target state of the air conditioner based on the provided HomeKit characteristic value.
   * Maps the HomeKit target states to the corresponding LG operation modes and updates the device state.
   *
   * @param value - The target state value from HomeKit, represented as a `CharacteristicValue`.
   *                Possible values include AUTO, HEAT, and COOL.
   * @returns The updated target state value if successful, or `null` if an error occurs.
   *
   * @throws Logs an error if the operation mode cannot be updated on the device.
   */
  async setTargetState(value: CharacteristicValue) {
    this.logger.debug('Set target AC mode = ', value);
    this.currentTargetState = value as number;
    const {
      Characteristic: {
        TargetHeaterCoolerState,
      },
    } = this.platform;

    // Map HomeKit states to LG opModes
    let opMode;
    switch (value) {
    case TargetHeaterCoolerState.AUTO:
      opMode = OpMode.AUTO; // LG’s AUTO mode = 6
      break;
    case TargetHeaterCoolerState.HEAT:
      opMode = OpMode.HEAT; // LG’s HEAT mode = 4
      break;
    case TargetHeaterCoolerState.COOL:
      opMode = OpMode.COOL; // LG’s COOL mode = 0
      break;
    default:
      opMode = this.Status.opMode; // Keep current mode
    }

    if (opMode === this.Status.opMode) {
      return;
    }
    try {
      await this.setOpMode(this.accessory.context.device.id, opMode);
    } catch (error) {
      this.logger.error('Error setting target state:', error);
    }
  }

  async setActive(value: CharacteristicValue) {
    const device: Device = this.accessory.context.device;
    let isOnNumeric: number;
    if (typeof value === 'boolean') {
      isOnNumeric = value ? 1 : 0;
    } else if (typeof value === 'number') {
      isOnNumeric = value ? 1 : 0;
    } else {
      this.logger.error('Invalid value for active state (expected boolean or number):', value);
      return;
    }
    this.logger.debug('Set power on = ', isOnNumeric, ' current status = ', this.Status.isPowerOn);
    if ((this.Status.isPowerOn && isOnNumeric === 1) || (!this.Status.isPowerOn && isOnNumeric === 0)) {
      this.logger.debug('Power state already matches incoming value; skipping deviceControl.');
      return;
    }
    try {
      const success = await this.platform.ThinQ?.deviceControl(device.id, {
        dataKey: 'airState.operation',
        dataValue: isOnNumeric,
      }, 'Operation');
      if (success) {
        this.accessory.context.device.data.snapshot['airState.operation'] = isOnNumeric;
        this.updateAccessoryActiveCharacteristic();
      }
    } catch (error) {
      this.logger.error('Error setting active state:', error);
    }
  }

  /**
   * Sets the target temperature for the air conditioner.
   * 
   * @param value - The desired target temperature as a `CharacteristicValue`.
   * 
   * @returns The target temperature if successfully set, or `null` if an error occurs or the operation is invalid.
   * 
   * @remarks
   * - If the air conditioner is powered off, the method logs an error and returns `null`.
   * - If the provided value is not a number, the method logs an error and returns `null`.
   * - The method checks whether the target temperature is within the valid range for the current mode 
   *   (cooling or heating). If the value is out of range, it logs an error and returns `null`.
   * - If the target temperature is the same as the current temperature, no action is taken, and the method logs a debug message.
   * - The temperature value is converted from HomeKit format to LG format before being sent to the device.
   * - If the operation fails, an error is logged, and the method returns `null`.
   * 
   * @throws This method does not throw exceptions but logs errors instead.
   */
  async setTargetTemperature(value: CharacteristicValue) {
    const status = this.Status;
    if (!status.isPowerOn) {
      this.logger.error('Power is off, cannot set target temperature');
      return;
    }
    const device: Device = this.accessory.context.device;

    if (typeof value !== 'number') {
      this.logger.error('Invalid temperature value: ', value);
      return;
    }
    // Calculate LG temperature with the status helper
    const temperatureLG = status.convertTemperatureCelsiusFromHomekitToLG(value);
    if (typeof temperatureLG !== 'number' || isNaN(temperatureLG)) {
      this.logger.error('Converted temperature is not a valid number:', temperatureLG);
      return;
    }

    if (temperatureLG === status.targetTemperature) {
      this.logger.debug('Target temperature is identical to current setting; skipping.');
      return;
    }

    try {
      await this.platform.ThinQ?.deviceControl(device.id, {
        dataKey: 'airState.tempState.target',
        dataValue: temperatureLG,
      });
      this.accessory.context.device.data.snapshot['airState.tempState.target'] = temperatureLG;
      this.updateAccessoryTemperatureCharacteristics();
      return;
    } catch (error) {
      this.logger.error('Error setting target temperature:', error);
    }
  }

  /**
   * Sets the fan speed of the air conditioner.
   *
   * @param value - The desired fan speed value, which is expected to be a number.
   *                The value is rounded and constrained to a minimum of 1.
   * @returns The provided fan speed value if the operation is successful, or `null` if the power is off
   *          or an error occurs during the operation.
   *
   * @remarks
   * - If the air conditioner is not powered on (`this.Status.isPowerOn` is `false`), the method exits early and returns `null`.
   * - The fan speed value is mapped to a corresponding wind strength value using the `FanSpeed` enumeration.
   * - The method sends a control command to the ThinQ platform to update the fan speed.
   * - If the operation is successful, the updated wind strength value is stored in the device's snapshot.
   * - Any errors encountered during the operation are logged, and the method returns `null`.
   *
   * @throws This method does not throw exceptions directly but logs errors internally if the operation fails.
   */
  async setFanSpeed(value: CharacteristicValue) {
    if (!this.Status.isPowerOn) {
      return;
    }

    const speedValue = Math.max(1, Math.round(value as number));

    this.logger.debug('Set fan speed = ', speedValue);
    const device: Device = this.accessory.context.device;
    const windStrength = parseInt(Object.keys(FanSpeed)[speedValue - 1]) || FanSpeed.HIGH;
    try {
      await this.platform.ThinQ?.deviceControl(device.id, {
        dataKey: 'airState.windStrength',
        dataValue: windStrength,
      });
      this.accessory.context.device.data.snapshot['airState.windStrength'] = windStrength;
    } catch (error) {
      this.logger.error('Error setting fan speed:', error);
    }
  }

  async setSwingMode(value: CharacteristicValue) {
    if (!this.Status.isPowerOn) {
      this.logger.debug('Power is off, cannot set swing mode');
      return;
    }

    const swingValue = !!value as boolean ? '100' : '0';

    const device: Device = this.accessory.context.device;
    try {
      if (this.config.ac_swing_mode === 'BOTH') {
        await this.platform.ThinQ?.deviceControl(device.id, {
          dataKey: null,
          dataValue: null,
          dataSetList: {
            'airState.wDir.vStep': swingValue,
            'airState.wDir.hStep': swingValue,
          },
          dataGetList: null,
        }, 'Set', 'favoriteCtrl');
        this.accessory.context.device.data.snapshot['airState.wDir.vStep'] = swingValue;
        this.accessory.context.device.data.snapshot['airState.wDir.hStep'] = swingValue;
      } else if (this.config.ac_swing_mode === 'VERTICAL') {
        await this.platform.ThinQ?.deviceControl(device.id, {
          dataKey: 'airState.wDir.vStep',
          dataValue: swingValue,
        });
        this.accessory.context.device.data.snapshot['airState.wDir.vStep'] = swingValue;
      } else if (this.config.ac_swing_mode === 'HORIZONTAL') {
        await this.platform.ThinQ?.deviceControl(device.id, {
          dataKey: 'airState.wDir.hStep',
          dataValue: swingValue,
        });
        this.accessory.context.device.data.snapshot['airState.wDir.hStep'] = swingValue;
      }
      this.updateAccessoryFanStateCharacteristics();
      this.updateAccessoryFanV2Characteristic();
    } catch (error) {
      this.logger.error('Error setting swing mode:', error);
    }

  }

  async setOpMode(deviceId: string, opMode: number): Promise<boolean> {
    return await this.platform.ThinQ?.deviceControl(deviceId, {
      dataKey: 'airState.opMode',
      dataValue: opMode,
    });
  }

  protected isJetModeEnabled(model: string) {
    return this.jetModeModels.includes(model); // cool mode only
  }

  public setupButton(device: Device) {
    if (!this.config.ac_buttons.length) {
      return;
    }

    this.serviceLabelButtons = this.accessory.getService('Buttons')
      || this.accessory.addService(this.platform.Service.ServiceLabel, 'Buttons', 'Buttons');

    // remove all buttons before
    for (let i = 0; i < this.serviceLabelButtons.linkedServices.length; i++) {
      this.accessory.removeService(this.serviceLabelButtons.linkedServices[i]);
    }

    for (let i = 0; i < this.config.ac_buttons.length; i++) {
      this.setupButtonOpmode(device, this.config.ac_buttons[i].name, parseInt(this.config.ac_buttons[i].op_mode));
    }
  }

  protected setupButtonOpmode(device: Device, name: string, opMode: number) {
    const {
      Service: {
        Switch,
      },
      Characteristic,
    } = this.platform;

    if (!this.serviceLabelButtons) {
      this.logger.error('ServiceLabelButtons not found cant setup button');
      return;
    }

    const serviceButton = this.accessory.getService(name) || this.accessory.addService(Switch, name, name);
    serviceButton.addOptionalCharacteristic(Characteristic.ConfiguredName);
    serviceButton.setCharacteristic(Characteristic.ConfiguredName, name);
    serviceButton.getCharacteristic(this.platform.Characteristic.On)
      .onGet(() => {
        return this.Status.opMode === opMode;
      })
      .onSet((value: CharacteristicValue) => {
        this.handleButtonOpmode(value, opMode);
      });

    this.serviceLabelButtons.addLinkedService(serviceButton);
  }

  /**
   * Handles the operation mode button press for the air conditioner.
   *
   * @param value - The characteristic value indicating the button state (true for pressed, false for released).
   * @param opMode - The operation mode to set when the button is pressed.
   * 
   * When the button is pressed (`value` is true) and the current operation mode (`this.Status.opMode`)
   * is different from the provided `opMode`, the method updates the operation mode to the provided `opMode`.
   * 
   * When the button is released (`value` is false), the method resets the operation mode to `OpMode.COOL`,
   * updates the accessory state characteristics, and restores the target state to the current target state.
   * 
   * @returns A promise that resolves when the operation mode and related states are successfully updated.
   */
  async handleButtonOpmode(value: CharacteristicValue, opMode: number) {
    if (value as boolean) {
      if (this.Status.opMode !== opMode) {
        await this.setOpMode(this.accessory.context.device.id, opMode);
        this.accessory.context.device.data.snapshot['airState.opMode'] = opMode;
      }
    } else {
      await this.setOpMode(this.accessory.context.device.id, OpMode.COOL);
      this.accessory.context.device.data.snapshot['airState.opMode'] = OpMode.COOL;
      await this.setTargetState(this.currentTargetState);
    }
  }
}

export class ACStatus {
  constructor(protected data: any, protected device: Device, protected config: Config, private logger: Logger) {
  }

  /**
   * detect fahrenheit unit device by country code
   * list: us
   */
  public get isFahrenheitUnit() {
    return (this.config.ac_temperature_unit || '').toLowerCase() === 'f';
  }

  /**
   * Converts temperature from Homekit to LG format.
   * @param temperatureInCelsius The temperature in Celsius to convert.
   * @returns The converted temperature in LG format.
   */
  public convertTemperatureCelsiusFromHomekitToLG(temperatureInCelsius: CharacteristicValue): number {
    const tempNum = Number(temperatureInCelsius);
    if (!this.isFahrenheitUnit) {
      return tempNum;
    }
    const temperatureInFahrenheit = Math.round(cToF(tempNum));
    try {
      const mapped = this.device.deviceModel.lookupMonitorValue && this.device.deviceModel.lookupMonitorValue('TempFahToCel', String(temperatureInFahrenheit));
      if (typeof mapped !== 'undefined' && mapped !== null) {
        const n = Number(mapped);
        if (!isNaN(n)) {
          return n;
        }
      }
    } catch (e) {
      this.logger.warn('Temperature mapping lookup failed, falling back to direct conversion.', e);
    }
    return temperatureInFahrenheit;
  }

  /**
   * algorithm conversion LG vs Homekit is different
   * so we need to handle it before submit to homekit
   */
  public convertTemperatureCelsiusFromLGToHomekit(temperature: number): number {
    const tempNum = Number(temperature);
    if (!this.isFahrenheitUnit) {
      return tempNum;
    }
    try {
      const mapped = this.device.deviceModel.lookupMonitorValue && this.device.deviceModel.lookupMonitorValue('TempCelToFah', String(tempNum));
      if (typeof mapped !== 'undefined' && mapped !== null) {
        const n = Number(mapped);
        if (!isNaN(n)) {
          return Math.round(fToC(n) * 100) / 100;
        }
      }
    } catch (e) {
      this.logger.warn('Temperature mapping lookup failed, falling back to direct conversion.', e);
    }
    const c = Math.round(fToC(tempNum) * 100) / 100;
    return c;
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

  // Should return 0 - 100 int
  public get windStrength() {
    const raw = this.data && this.data['airState.windStrength'];
    const num = Number(raw);
    if (!isNaN(num)) {
      if (num === FAN_SPEED_AUTO) {
        return Math.round(Object.keys(FanSpeed).length / 2);
      }
      const min = 2;
      const max = 6;
      if (num >= min && num <= max) {
        return Math.round(((num - min) / (max - min)) * 100) || 1;
      }
    }
    return Math.round(Object.keys(FanSpeed).length / 2);
  }

  public get isWindStrengthAuto() {
    const raw = this.data && this.data['airState.windStrength'];
    return Number(raw) === FAN_SPEED_AUTO;
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
    const consumption = this.data['airState.energy.onCurrent'];
    if (isNaN(consumption)) {
      return 0;
    }

    return consumption / 100;
  }

  public get type() {
    return this.device.deviceModel.data.Info.modelType || ACModelType.RAC;
  }

  /**
   * Retrieves the temperature range based on the provided minimum and maximum range values.
   *
   * @param [minRange, maxRange] - A tuple containing the minimum and maximum range values as `EnumValue` objects.
   * @returns A `RangeValue` object representing the temperature range, including its type, minimum, maximum, and step values.
   *
   * The method first attempts to calculate the temperature range using the provided `minRange` and `maxRange` values.
   * If these values are not sufficient to determine a valid range, it falls back to retrieving the range from the device model's
   * `airState.tempState.limitMin` or `airState.tempState.target` properties.
   */
  public getTemperatureRange([minRange, maxRange]: [EnumValue, EnumValue]): RangeValue {
    let temperature: RangeValue = {
      type: ValueType.Range,
      min: 0,
      max: 0,
      step: 0.01,
    };

    if (minRange && maxRange) {

      const minRangeOptions: number[] = Object.values(minRange.options).filter((v): v is number => typeof v === 'number');
      const maxRangeOptions: number[] = Object.values(maxRange.options).filter((v): v is number => typeof v === 'number');

      if (minRangeOptions.length > 1) {
        temperature.min = Math.min(...minRangeOptions.filter(v => v !== 0));
      }
      if (maxRangeOptions.length > 1) {
        temperature.max = Math.max(...maxRangeOptions.filter(v => v !== 0));
      }
    }

    if (!temperature || !temperature.min || !temperature.max) {
      temperature = this.device.deviceModel.value('airState.tempState.limitMin') as RangeValue;
    }

    if (!temperature || !temperature.min || !temperature.max) {
      temperature = this.device.deviceModel.value('airState.tempState.target') as RangeValue;
    }

    return temperature;
  }

  /**
   * Retrieves the temperature range for heating based on the air conditioner's model type.
   *
   * For AWHP models, the range is determined using water temperature heating limits.
   * For other models, the range is determined using general heating limits.
   *
   * @returns A tuple containing two `EnumValue` objects:
   *          - The first element represents the minimum heating temperature.
   *          - The second element represents the maximum heating temperature.
   */
  public getTemperatureRangeForHeating(): [EnumValue, EnumValue] {
    let heatLowLimitKey, heatHighLimitKey;

    if (this.type === ACModelType.AWHP) {
      heatLowLimitKey = 'support.airState.tempState.waterTempHeatMin';
      heatHighLimitKey = 'support.airState.tempState.waterTempHeatMax';
    } else {
      heatLowLimitKey = 'support.heatLowLimit';
      heatHighLimitKey = 'support.heatHighLimit';
    }

    const tempHeatMinRange = this.device.deviceModel.value(heatLowLimitKey) as EnumValue;
    const tempHeatMaxRange = this.device.deviceModel.value(heatHighLimitKey) as EnumValue;
    return [tempHeatMinRange, tempHeatMaxRange];
  }

  /**
   * Retrieves the temperature range for cooling based on the air conditioner's model type.
   *
   * For AWHP models, the range is determined using water temperature cooling limits.
   * For other models, the range is determined using general cooling limits.
   *
   * @returns A tuple containing two `EnumValue` objects:
   *          - The first element represents the minimum cooling temperature.
   *          - The second element represents the maximum cooling temperature.
   */
  public getTemperatureRangeForCooling(): [EnumValue, EnumValue] {
    let coolLowLimitKey, coolHighLimitKey;

    if (this.type === ACModelType.AWHP) {
      coolLowLimitKey = 'support.airState.tempState.waterTempCoolMin';
      coolHighLimitKey = 'support.airState.tempState.waterTempCoolMax';
    } else {
      coolLowLimitKey = 'support.coolLowLimit';
      coolHighLimitKey = 'support.coolHighLimit';
    }

    const tempCoolMinRange = this.device.deviceModel.value(coolLowLimitKey) as EnumValue;
    const tempCoolMaxRange = this.device.deviceModel.value(coolHighLimitKey) as EnumValue;
    return [tempCoolMinRange, tempCoolMaxRange];
  }
}

