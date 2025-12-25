import { LGThinQHomebridgePlatform } from '../platform.js';
import { CharacteristicValue, Logger, PlatformAccessory, Service } from 'homebridge';
import { Device } from '../lib/Device.js';
import { AccessoryContext, BaseDevice } from '../baseDevice.js';
import { safeParseInt, normalizeNumber } from '../helper.js';
import { FILTER_CHANGE_THRESHOLD_PERCENT } from '../lib/constants.js';

export enum RotateSpeed {
  LOW = 2,
  MEDIUM = 4,
  HIGH = 6,
  EXTRA = 7,
}

// opMode = 14 => normal mode, can rotate speed
export default class AirPurifier extends BaseDevice {
  protected serviceAirPurifier: Service | undefined;
  protected serviceAirQuality: Service;
  protected serviceLight: Service | undefined;
  protected serviceFilterMaintenance: Service | undefined;
  protected serviceAirFastMode: Service | undefined;

  constructor(
    public readonly platform: LGThinQHomebridgePlatform,
    public readonly accessory: PlatformAccessory<AccessoryContext>,
    logger: Logger,
  ) {
    super(platform, accessory, logger);

    const {
      Service: {
        AirPurifier,
        AirQualitySensor,
        Lightbulb,
        FilterMaintenance,
        Switch,
      },
      Characteristic,
    } = this.platform;

    const device: Device = accessory.context.device;

    // get the service if it exists, otherwise create a new service
    this.serviceAirPurifier = this.getOrCreateService(AirPurifier, 'Air Purifier');

    /**
     * Required Characteristics: Active, CurrentAirPurifierState, TargetAirPurifierState
     */
    this.serviceAirPurifier.getCharacteristic(Characteristic.Active)
      .onGet(() => {
        return this.Status.isPowerOn ? Characteristic.Active.ACTIVE : Characteristic.Active.INACTIVE;
      })
      .onSet(this.setActive.bind(this));
    this.serviceAirPurifier.getCharacteristic(Characteristic.TargetAirPurifierState)
      .onSet(this.setTargetAirPurifierState.bind(this));

    /**
     * Optional Characteristics: Name, RotationSpeed, SwingMode
     */
    this.serviceAirPurifier.setCharacteristic(Characteristic.Name, device.name);
    this.serviceAirPurifier.getCharacteristic(Characteristic.SwingMode).onSet(this.setSwingMode.bind(this));
    this.serviceAirPurifier.getCharacteristic(Characteristic.RotationSpeed)
      .onSet(this.setRotationSpeed.bind(this))
      .setProps({ minValue: 0, maxValue: Object.keys(RotateSpeed).length / 2, minStep: 0.1 });

    this.serviceAirQuality = this.getOrCreateService(AirQualitySensor, 'Air Quality Sensor');

    // check if light is available
    const hasLightControl = 'airState.lightingState.displayControl' in device.snapshot
      || 'airState.lightingState.signal' in device.snapshot;
    this.serviceLight = this.ensureService(Lightbulb, 'Light', hasLightControl, 'Light');
    if (this.serviceLight) {
      this.serviceLight.getCharacteristic(Characteristic.On).onSet(this.setLight.bind(this));
    }

    this.serviceFilterMaintenance = this.ensureService(
      FilterMaintenance, 'Filter Maintenance', !!this.Status.filterMaxTime, 'Filter Maintenance',
    );
    if (this.serviceFilterMaintenance) {
      this.serviceAirPurifier.addLinkedService(this.serviceFilterMaintenance);
    }

    this.serviceAirFastMode = this.ensureService(Switch, 'Air Fast', this.config.air_fast_mode, 'Air Fast');
    if (this.serviceAirFastMode) {
      this.serviceAirFastMode.getCharacteristic(Characteristic.On)
        .onSet(this.setAirFastActive.bind(this));
    }
  }

  public get Status() {
    return new AirPurifierStatus(this.accessory.context.device.snapshot);
  }

  public get config() {
    return Object.assign({}, {
      air_fast_mode: false,
    }, super.config);
  }

  async setAirFastActive(value: CharacteristicValue) {
    if (!this.Status.isPowerOn) {
      return;
    }

    const device: Device = this.accessory.context.device;
    const isOn = value as boolean ? 1 : 0;
    try {
      const result = await this.platform.ThinQ?.deviceControl(device.id, {
        dataKey: 'airState.miscFuncState.airFast',
        dataValue: isOn as number,
      });
      if (result) {
        device.data.snapshot['airState.miscFuncState.airFast'] = isOn as number;
        this.updateAccessoryCharacteristic(device);
      }
    } catch (error) {
      this.logger.error('Error setting air fast mode:', error);
    }
  }

  async setActive(value: CharacteristicValue) {
    const device: Device = this.accessory.context.device;
    const isOn = value as boolean ? 1 : 0;
    if (this.Status.isPowerOn && isOn) {
      return; // don't send same status
    }

    this.logger.debug('Set Active State ->', value);
    try {
      const result = await this.platform.ThinQ?.deviceControl(device.id, {
        dataKey: 'airState.operation',
        dataValue: isOn as number,
      });
      if (result) {
        device.data.snapshot['airState.operation'] = isOn as number;
        this.updateAccessoryCharacteristic(device);
      }
    } catch (error) {
      this.logger.error('Error setting active state:', error);
    }
  }

  async setTargetAirPurifierState(value: CharacteristicValue) {
    const device: Device = this.accessory.context.device;
    if (!this.Status.isPowerOn || (!!value !== this.Status.isNormalMode)) {
      return; // just skip it
    }

    this.logger.debug('Set Target State ->', value);
    try {
      await this.platform.ThinQ?.deviceControl(device.id, {
        dataKey: 'airState.opMode',
        dataValue: value as boolean ? 16 : 14,
      });
    } catch (error) {
      this.logger.error('Error setting target air purifier state:', error);
    }
  }

  async setRotationSpeed(value: CharacteristicValue) {
    if (!this.Status.isPowerOn || !this.Status.isNormalMode) {
      return;
    }

    const vNum = normalizeNumber(value);
    if (vNum === null) {
      return;
    }

    this.logger.debug('Set Rotation Speed ->', value);
    const device: Device = this.accessory.context.device;
    const values = Object.keys(RotateSpeed);
    const windStrength = safeParseInt(values[Math.round(vNum) - 1], RotateSpeed.EXTRA);
    try {
      const result = await this.platform.ThinQ?.deviceControl(device.id, {
        dataKey: 'airState.windStrength',
        dataValue: windStrength,
      });
      if (result) {
        device.data.snapshot['airState.windStrength'] = windStrength;
        this.updateAccessoryCharacteristic(device);
      }
    } catch (error) {
      this.logger.error('Error setting rotation speed:', error);
    }
  }

  async setSwingMode(value: CharacteristicValue) {
    if (!this.Status.isPowerOn || !this.Status.isNormalMode) {
      return;
    }

    const device: Device = this.accessory.context.device;
    const isSwing = value as boolean ? 1 : 0;
    try {
      const result = await this.platform.ThinQ?.deviceControl(device.id, {
        dataKey: 'airState.circulate.rotate',
        dataValue: isSwing,
      });
      if (result) {
        device.data.snapshot['airState.circulate.rotate'] = isSwing;
        this.updateAccessoryCharacteristic(device);
      }
    } catch (error) {
      this.logger.error('Error setting swing mode:', error);
    }
  }

  async setLight(value: CharacteristicValue) {
    if (!this.Status.isPowerOn) {
      return;
    }

    const device: Device = this.accessory.context.device;
    const isLightOn = value as boolean ? 1 : 0;
    let dataKey = '';
    if ('airState.lightingState.signal' in device.snapshot) {
      dataKey = 'airState.lightingState.signal';
    } else if ('airState.lightingState.displayControl' in device.snapshot) {
      dataKey = 'airState.lightingState.displayControl';
    }

    if (!dataKey) {
      return;
    }

    try {
      const result = await this.platform.ThinQ?.deviceControl(device.id, {
        dataKey,
        dataValue: isLightOn,
      });
      if (result) {
        device.data.snapshot[dataKey] = isLightOn;
        this.updateAccessoryCharacteristic(device);
      }
    } catch (error) {
      this.logger.error('Error setting light state:', error);
    }
  }

  public updateAccessoryCharacteristic(device: Device) {
    super.updateAccessoryCharacteristic(device);
    const {
      Characteristic,
      Characteristic: {
        TargetAirPurifierState,
        FilterChangeIndication,
      },
    } = this.platform;

    this.serviceAirPurifier?.updateCharacteristic(Characteristic.Active, this.Status.isPowerOn ? 1 : 0);
    this.serviceAirPurifier?.updateCharacteristic(Characteristic.CurrentAirPurifierState, this.Status.isPowerOn ? 2 : 0);
    this.serviceAirPurifier?.updateCharacteristic(TargetAirPurifierState,
      this.Status.isNormalMode ? TargetAirPurifierState.MANUAL : TargetAirPurifierState.AUTO);
    this.serviceAirPurifier?.updateCharacteristic(Characteristic.SwingMode, this.Status.isSwing ? 1 : 0);
    this.serviceAirPurifier?.updateCharacteristic(Characteristic.RotationSpeed, this.Status.rotationSpeed);

    if (this.Status.filterMaxTime && this.serviceFilterMaintenance) {
      this.serviceFilterMaintenance.updateCharacteristic(Characteristic.FilterLifeLevel, this.Status.filterUsedTimePercent);
      this.serviceFilterMaintenance.updateCharacteristic(FilterChangeIndication,
        this.Status.filterUsedTimePercent > FILTER_CHANGE_THRESHOLD_PERCENT ? FilterChangeIndication.CHANGE_FILTER : FilterChangeIndication.FILTER_OK);
    }

    // airState.quality.sensorMon = 1 mean sensor always running even device not running
    this.serviceAirQuality.updateCharacteristic(Characteristic.AirQuality, this.Status.airQuality.overall);
    this.serviceAirQuality.updateCharacteristic(Characteristic.PM2_5Density, this.Status.airQuality.PM2);
    this.serviceAirQuality.updateCharacteristic(Characteristic.PM10Density, this.Status.airQuality.PM10);
    this.serviceAirQuality.updateCharacteristic(Characteristic.StatusActive, this.Status.airQuality.isOn);

    if (this.serviceLight) {
      this.serviceLight.updateCharacteristic(Characteristic.On, this.Status.isLightOn);
    }

    if (this.config.air_fast_mode && this.serviceAirFastMode) {
      this.serviceAirFastMode.updateCharacteristic(Characteristic.On, this.Status.isAirFastEnable);
    }
  }
}

export class AirPurifierStatus {
  constructor(protected data: any) {
  }

  public get isPowerOn() {
    return this.data['airState.operation'] as boolean;
  }

  public get isLightOn() {
    if ('airState.lightingState.signal' in this.data) {
      return this.isPowerOn && this.data['airState.lightingState.signal'] as boolean;
    }

    if ('airState.lightingState.displayControl' in this.data) {
      return this.isPowerOn && this.data['airState.lightingState.displayControl'] as boolean;
    }

    return false;
  }

  public get isSwing() {
    return (this.data['airState.circulate.rotate'] || 0) as boolean;
  }

  public get airQuality() {
    return {
      isOn: this.isPowerOn || !!this.data['airState.quality.sensorMon'],
      overall: safeParseInt(this.data['airState.quality.overall']),
      PM2: safeParseInt(this.data['airState.quality.PM2']),
      PM10: safeParseInt(this.data['airState.quality.PM10']),
    };
  }

  public get rotationSpeed() {
    const index = Object.keys(RotateSpeed).indexOf(safeParseInt(this.data['airState.windStrength']).toString());
    return index !== -1 ? index + 1 : Object.keys(RotateSpeed).length / 2;
  }

  public get isNormalMode() {
    return this.data['airState.opMode'] === 14;
  }

  public get filterUsedTimePercent() {
    if (!this.filterMaxTime) {
      return 0;
    }

    return Math.round((1 - (this.filterUseTime / this.filterMaxTime)) * 100);
  }

  public get filterMaxTime() {
    return this.data['airState.filterMngStates.maxTime'] || 0;
  }

  public get filterUseTime() {
    return this.data['airState.filterMngStates.useTime'] || 0;
  }

  public get isAirFastEnable() {
    return this.data['airState.miscFuncState.airFast'] || 0;
  }
}
