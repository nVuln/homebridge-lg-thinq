import { LGThinQHomebridgePlatform } from '../platform.js';
import { CharacteristicValue, Logger, PlatformAccessory, Service } from 'homebridge';
import { Device } from '../lib/Device.js';
import { AccessoryContext, BaseDevice } from '../baseDevice.js';
import { DeviceModel } from '../lib/DeviceModel.js';
import { cToF, fToC, normalizeNumber, safeParseInt } from '../helper.js';

export default class Refrigerator extends BaseDevice {
  protected serviceFreezer: Service | undefined;
  protected serviceFridge: Service | undefined;
  protected serviceDoorOpened: Service | undefined;
  protected serviceExpressMode: Service | undefined;
  protected serviceExpressFridge: Service | undefined;
  protected serviceEcoFriendly: Service | undefined;
  protected serviceWaterFilter: Service | undefined;

  constructor(
    public readonly platform: LGThinQHomebridgePlatform,
    public readonly accessory: PlatformAccessory<AccessoryContext>,
    logger: Logger,
  ) {
    super(platform, accessory, logger);

    const {
      Service: {
        ContactSensor,
        Switch,
        ServiceLabel,
        FilterMaintenance,
      },
      Characteristic,
    } = this.platform;
    const device: Device = accessory.context.device;

    const serviceLabel = accessory.getService(ServiceLabel);
    if (serviceLabel) {
      accessory.removeService(serviceLabel);
    }

    this.serviceFridge = this.createThermostat('Fridge', 'fridgeTemp');
    if (this.serviceFridge) {
      this.serviceFridge.updateCharacteristic(Characteristic.TargetTemperature, this.Status.fridgeTemperature);
    }

    this.serviceFreezer = this.createThermostat('Freezer', 'freezerTemp');
    if (this.serviceFreezer) {
      this.serviceFreezer.updateCharacteristic(Characteristic.TargetTemperature, this.Status.freezerTemperature);
    }

    // Door open state
    this.serviceDoorOpened = this.getOrCreateService(ContactSensor, 'Refrigerator Door Closed');

    // Express Freezer mode
    const hasExpressFreezer = this.config.ref_express_freezer
      && device.snapshot && 'expressMode' in device.snapshot.refState;
    this.serviceExpressMode = this.ensureService(Switch, 'Express Freezer', hasExpressFreezer, 'Express Freezer');
    if (this.serviceExpressMode) {
      this.serviceExpressMode.getCharacteristic(Characteristic.On).onSet(this.setExpressMode.bind(this));
    }

    // Express Fridge mode
    const hasExpressFridge = this.config.ref_express_fridge
      && device.snapshot && 'expressFridge' in device.snapshot.refState;
    this.serviceExpressFridge = this.ensureService(Switch, 'Express Fridge', hasExpressFridge, 'Express Fridge');
    if (this.serviceExpressFridge) {
      this.serviceExpressFridge.getCharacteristic(Characteristic.On).onSet(this.setExpressFridge.bind(this));
    }

    // Eco Friendly mode
    const hasEcoFriendly = this.config.ref_eco_friendly
      && device.snapshot && 'ecoFriendly' in device.snapshot.refState;
    this.serviceEcoFriendly = this.ensureService(Switch, 'Eco Friendly', hasEcoFriendly, 'Eco Friendly');
    if (this.serviceEcoFriendly) {
      this.serviceEcoFriendly.getCharacteristic(Characteristic.On).onSet(this.setEcoFriendly.bind(this));
    }

    // Water Filter maintenance
    this.serviceWaterFilter = this.ensureService(
      FilterMaintenance, 'Water Filter Maintenance', this.Status.hasFeature('waterFilter'), 'Water Filter Maintenance',
    );
  }

  public get config() {
    return Object.assign({}, {
      ref_express_freezer: false,
      ref_express_fridge: false,
      ref_eco_friendly: false,
    }, super.config);
  }

  public get Status() {
    return new RefrigeratorStatus(this.accessory.context.device.snapshot?.refState, this.accessory.context.device.deviceModel);
  }

  /**
   * update accessory characteristic by device
   */
  public updateAccessoryCharacteristic(device: Device) {
    super.updateAccessoryCharacteristic(device);

    const {
      Characteristic,
      Characteristic: {
        FilterLifeLevel,
        FilterChangeIndication,
      },
    } = this.platform;

    const tempBetween = (props: any, value: number) => {
      return Math.min(Math.max(props.minValue, value), props.maxValue);
    };

    if (this.serviceFreezer) {
      const t = tempBetween(this.serviceFreezer.getCharacteristic(Characteristic.TargetTemperature).props, this.Status.freezerTemperature);
      this.serviceFreezer.updateCharacteristic(Characteristic.CurrentTemperature, t);
      this.serviceFreezer.updateCharacteristic(Characteristic.TargetTemperature, t);
    }

    if (this.serviceFridge) {
      const t = tempBetween(this.serviceFridge.getCharacteristic(Characteristic.TargetTemperature).props, this.Status.fridgeTemperature);
      this.serviceFridge.updateCharacteristic(Characteristic.CurrentTemperature, t);
      this.serviceFridge.updateCharacteristic(Characteristic.TargetTemperature, t);
    }

    if (this.serviceDoorOpened) {
      const contactSensorValue = this.Status.isDoorClosed ?
        Characteristic.ContactSensorState.CONTACT_DETECTED : Characteristic.ContactSensorState.CONTACT_NOT_DETECTED;
      this.serviceDoorOpened.updateCharacteristic(Characteristic.ContactSensorState, contactSensorValue);
    }
    if (device.snapshot) {
      if (this.config.ref_express_freezer && 'expressMode' in device.snapshot.refState && this.serviceExpressMode) {
        this.serviceExpressMode.updateCharacteristic(Characteristic.On, this.Status.isExpressModeOn);
      }

      if (this.config.ref_express_fridge && 'expressFridge' in device.snapshot.refState && this.serviceExpressFridge) {
        this.serviceExpressFridge.updateCharacteristic(Characteristic.On, this.Status.isExpressFridgeOn);
      }

      if (this.config.ref_eco_friendly && 'ecoFriendly' in device.snapshot.refState && this.serviceEcoFriendly) {
        this.serviceEcoFriendly.updateCharacteristic(Characteristic.On, this.Status.isEcoFriendlyOn);
      }
    }

    if (this.Status.hasFeature('waterFilter') && this.serviceWaterFilter) {
      this.serviceWaterFilter.updateCharacteristic(FilterLifeLevel, this.Status.waterFilterRemain);
      this.serviceWaterFilter.updateCharacteristic(FilterChangeIndication,
        this.Status.waterFilterRemain < 5 ? FilterChangeIndication.CHANGE_FILTER : FilterChangeIndication.FILTER_OK);
    }
  }

  async setExpressMode(value: CharacteristicValue) {
    const device: Device = this.accessory.context.device;
    const On = device.deviceModel.lookupMonitorName('expressMode', '@CP_ON_EN_W');
    const Off = device.deviceModel.lookupMonitorName('expressMode', '@CP_OFF_EN_W');
    try {
      await this.platform.ThinQ?.deviceControl(device.id, {
        dataKey: null,
        dataValue: null,
        dataSetList: {
          refState: {
            expressMode: value as boolean ? On : Off,
            tempUnit: this.Status.tempUnit,
          },
        },
        dataGetList: null,
      });
      this.logger.debug('Set Express Freezer ->', value);
    } catch (error) {
      this.logger.error('Failed to set express mode:', error);
    }
  }

  async setExpressFridge(value: CharacteristicValue) {
    const device: Device = this.accessory.context.device;
    const On = device.deviceModel.lookupMonitorName('expressFridge', '@CP_ON_EN_W');
    const Off = device.deviceModel.lookupMonitorName('expressFridge', '@CP_OFF_EN_W');
    try {
      await this.platform.ThinQ?.deviceControl(device.id, {
        dataKey: null,
        dataValue: null,
        dataSetList: {
          refState: {
            expressFridge: value as boolean ? On : Off,
            tempUnit: this.Status.tempUnit,
          },
        },
        dataGetList: null,
      });
      this.logger.debug('Set Express Fridge ->', value);
    } catch (error) {
      this.logger.error('Failed to set express fridge:', error);
    }
  }

  async setEcoFriendly(value: CharacteristicValue) {
    const device: Device = this.accessory.context.device;
    const On = device.deviceModel.lookupMonitorName('ecoFriendly', '@CP_ON_EN_W');
    const Off = device.deviceModel.lookupMonitorName('ecoFriendly', '@CP_OFF_EN_W');
    try {
      await this.platform.ThinQ?.deviceControl(device.id, {
        dataKey: null,
        dataValue: null,
        dataSetList: {
          refState: {
            ecoFriendly: value as boolean ? On : Off,
            tempUnit: this.Status.tempUnit,
          },
        },
        dataGetList: null,
      });
      this.logger.debug('Set Eco Friendly ->', value);
    } catch (error) {
      this.logger.error('Failed to set eco friendly:', error);
    }
  }

  async tempUnit() {
    const {
      Characteristic: {
        TemperatureDisplayUnits,
      },
    } = this.platform;
    return this.Status.tempUnit === 'CELSIUS' ? TemperatureDisplayUnits.CELSIUS : TemperatureDisplayUnits.FAHRENHEIT;
  }

  /**
   * create a thermostat service
   */
  protected createThermostat(name: string, key: string): Service | undefined {
    const device: Device = this.accessory.context.device;
    if (!this.Status.hasFeature(key)) {
      return;
    }

    const { Characteristic } = this.platform;
    const isCelsius = this.Status.tempUnit === 'CELSIUS';

    let service = this.accessory.getService(name);
    if (!service) {
      service = this.accessory.addService(this.platform.Service.Thermostat, name, name);
      service.addOptionalCharacteristic(Characteristic.ConfiguredName);
      service.updateCharacteristic(Characteristic.ConfiguredName, name);
    }

    // Restrict to Cool only
    service.updateCharacteristic(Characteristic.CurrentHeatingCoolingState, Characteristic.CurrentHeatingCoolingState.COOL)
      .getCharacteristic(Characteristic.CurrentHeatingCoolingState)
      .setProps({
        validValues: [Characteristic.CurrentHeatingCoolingState.COOL], // Hide other states
      });

    service.getCharacteristic(Characteristic.TargetHeatingCoolingState)
      .updateValue(Characteristic.TargetHeatingCoolingState.COOL)
      .setProps({
        validValues: [Characteristic.TargetHeatingCoolingState.COOL], // Hide Heat/Auto/Off
      });

    service.getCharacteristic(Characteristic.TemperatureDisplayUnits).setProps({
      minValue: Characteristic.TemperatureDisplayUnits.CELSIUS,
      maxValue: Characteristic.TemperatureDisplayUnits.FAHRENHEIT,
    }).onGet(this.tempUnit.bind(this));

    const valueMapping = device.deviceModel.monitoringValueMapping(key + '_C') || device.deviceModel.monitoringValueMapping(key);
    if (!valueMapping) {
      this.logger.error(`[Refrigerator] [${this.accessory.context.device.name}] No value mapping found for ${key}`);
      return service;
    }

    const values = Object.values(valueMapping)
      .map(value => {
        if (value && typeof value === 'object' && 'label' in value) {
          return safeParseInt(value.label as string, NaN);
        }

        return safeParseInt(value as string, NaN);
      })
      .filter(value => {
        return !isNaN(value);
      });

    service.getCharacteristic(Characteristic.TargetTemperature)
      .updateValue(Math.min(...values))
      .onSet(async (value: CharacteristicValue) => { // value in celsius
        const vNum = normalizeNumber(value);
        if (vNum === null) {
          throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.INVALID_VALUE_IN_REQUEST);
        }

        let indexValue;
        if (this.Status.tempUnit === 'FAHRENHEIT') {
          indexValue = device.deviceModel.lookupMonitorName(key + '_F', cToF(vNum).toString())
            || device.deviceModel.lookupMonitorName(key, cToF(vNum).toString());
        } else {
          indexValue = device.deviceModel.lookupMonitorName(key + '_C', vNum.toString())
            || device.deviceModel.lookupMonitorName(key, vNum.toString());
        }

        if (!indexValue) {
          throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.INVALID_VALUE_IN_REQUEST);
        }

        await this.setTemperature(key, indexValue);
      })
      .setProps({ minValue: Math.min(...values), maxValue: Math.max(...values), minStep: isCelsius ? 1 : 0.1 });

    return service;
  }

  async setTemperature(key: string, temp: string) {
    const device: Device = this.accessory.context.device;
    try {
      await this.platform.ThinQ?.deviceControl(device.id, {
        dataKey: null,
        dataValue: null,
        dataSetList: {
          refState: {
            [key]: safeParseInt(temp),
            tempUnit: this.Status.tempUnit,
          },
        },
        dataGetList: null,
      });
    } catch (error) {
      this.logger.error(`[${device.name}] Error setting temperature:`, error);
    }
  }
}

export class RefrigeratorStatus {
  constructor(protected data: any, protected deviceModel: DeviceModel) {
  }

  public get freezerTemperature() {
    if (this.tempUnit === 'FAHRENHEIT') {
      return fToC(safeParseInt(this.deviceModel.lookupMonitorValue2('freezerTemp_F', this.data?.freezerTemp, '0')));
    }

    return safeParseInt(this.deviceModel.lookupMonitorValue2('freezerTemp_C', this.data?.freezerTemp, '0'));
  }

  public get fridgeTemperature() {
    if (this.tempUnit === 'FAHRENHEIT') {
      return fToC(safeParseInt(this.deviceModel.lookupMonitorValue2('fridgeTemp_F', this.data?.fridgeTemp, '0')));
    }

    return safeParseInt(this.deviceModel.lookupMonitorValue2('fridgeTemp_C', this.data?.fridgeTemp, '0'));
  }

  public get isDoorClosed() {
    return this.data?.atLeastOneDoorOpen === 'CLOSE';
  }

  public get isExpressModeOn() {
    return this.data?.expressMode === this.deviceModel.lookupMonitorName('expressMode', '@CP_ON_EN_W');
  }

  public get isExpressFridgeOn() {
    return this.data?.expressFridge === this.deviceModel.lookupMonitorName('expressFridge', '@CP_ON_EN_W');
  }

  public get isEcoFriendlyOn() {
    return this.data?.ecoFriendly === this.deviceModel.lookupMonitorName('ecoFriendly', '@CP_ON_EN_W');
  }

  public get tempUnit() {
    return this.data?.tempUnit || 'CELSIUS';
  }

  public get waterFilterRemain() {
    if ('waterFilter1RemainP' in this.data) {
      return this.data?.waterFilter1RemainP || 0;
    }

    if ('waterFilter' in this.data) {
      const usedInMonth = parseInt(this.data?.waterFilter.match(/(\d)_/)[1]);
      if (isNaN(usedInMonth)) {
        return 0;
      }

      return (12 - usedInMonth) / 12 * 100;
    }

    return this.data?.waterFilter1RemainP || 0;
  }

  public hasFeature(key: string) {
    const visibleItem = this.deviceModel.data.Config?.visibleItems?.find((item: any) => item.Feature === key || item.feature === key);
    if (!visibleItem) {
      return false;
    } else if (visibleItem.ControlTitle === undefined && visibleItem.controlTitle === undefined) {
      return false;
    }

    return true;
  }
}