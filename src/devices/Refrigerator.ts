import { LGThinQHomebridgePlatform } from '../platform';
import { CharacteristicValue, Logger, PlatformAccessory } from 'homebridge';
import { Device } from '../lib/Device';
import { baseDevice } from '../baseDevice';
import { DeviceModel } from '../lib/DeviceModel';
import { cToF, fToC } from '../helper';

export default class Refrigerator extends baseDevice {
  protected serviceFreezer;
  protected serviceFridge;
  protected serviceDoorOpened;
  protected serviceExpressMode;
  protected serviceExpressFridge;
  protected serviceEcoFriendly;
  protected serviceWaterFilter;

  constructor(
    public readonly platform: LGThinQHomebridgePlatform,
    public readonly accessory: PlatformAccessory,
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
    this.serviceDoorOpened = accessory.getService(ContactSensor);
    if (!this.serviceDoorOpened) {
      this.serviceDoorOpened = accessory.addService(ContactSensor, 'Refrigerator Door Closed');
      this.serviceDoorOpened.addOptionalCharacteristic(Characteristic.ConfiguredName);
      this.serviceDoorOpened.updateCharacteristic(Characteristic.ConfiguredName, 'Refrigerator Door Closed');
    }

    this.serviceExpressMode = accessory.getService('Express Freezer');
    if (this.config.ref_express_freezer && 'expressMode' in device.snapshot?.refState) {
      if (!this.serviceExpressMode) {
        this.serviceExpressMode = accessory.addService(Switch, 'Express Freezer', 'Express Freezer');
        this.serviceExpressMode.addOptionalCharacteristic(Characteristic.ConfiguredName);
        this.serviceExpressMode.updateCharacteristic(Characteristic.ConfiguredName, 'Express Freezer');
      }

      this.serviceExpressMode.getCharacteristic(Characteristic.On).onSet(this.setExpressMode.bind(this));
    } else if (this.serviceExpressMode) {
      accessory.removeService(this.serviceExpressMode);
      this.serviceExpressMode = null;
    }

    this.serviceExpressFridge = accessory.getService('Express Fridge');
    if (this.config.ref_express_fridge && 'expressFridge' in device.snapshot?.refState) {
      if (!this.serviceExpressFridge) {
        this.serviceExpressFridge = accessory.addService(Switch, 'Express Fridge', 'Express Fridge');
        this.serviceExpressFridge.addOptionalCharacteristic(Characteristic.ConfiguredName);
        this.serviceExpressFridge.updateCharacteristic(Characteristic.ConfiguredName, 'Express Fridge');
      }

      this.serviceExpressFridge.getCharacteristic(Characteristic.On).onSet(this.setExpressFridge.bind(this));
    } else if (this.serviceExpressFridge) {
      accessory.removeService(this.serviceExpressFridge);
      this.serviceExpressFridge = null;
    }

    this.serviceEcoFriendly = accessory.getService('Eco Friendly');
    if (this.config.ref_eco_friendly && 'ecoFriendly' in device.snapshot?.refState) {
      if (!this.serviceEcoFriendly) {
        this.serviceEcoFriendly = accessory.addService(Switch, 'Eco Friendly', 'Eco Friendly');
        this.serviceEcoFriendly.addOptionalCharacteristic(Characteristic.ConfiguredName);
        this.serviceEcoFriendly.updateCharacteristic(Characteristic.ConfiguredName, 'Eco Friendly');
      }

      this.serviceEcoFriendly.getCharacteristic(Characteristic.On).onSet(this.setEcoFriendly.bind(this));
    } else if (this.serviceEcoFriendly) {
      accessory.removeService(this.serviceEcoFriendly);
      this.serviceEcoFriendly = null;
    }

    if (this.Status.hasFeature('waterFilter')) {
      this.serviceWaterFilter = accessory.getService('Water Filter Maintenance');
      if (!this.serviceWaterFilter) {
        this.serviceWaterFilter = accessory.addService(FilterMaintenance, 'Water Filter Maintenance', 'Water Filter Maintenance');
        this.serviceWaterFilter.addOptionalCharacteristic(Characteristic.ConfiguredName);
        this.serviceWaterFilter.updateCharacteristic(Characteristic.ConfiguredName, 'Water Filter Maintenance');
      }

      this.serviceWaterFilter.updateCharacteristic(Characteristic.Name, 'Water Filter Maintenance');
    }
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

    const tempBetween = (props, value) => {
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

    if (this.config.ref_express_freezer && 'expressMode' in device.snapshot?.refState && this.serviceExpressMode) {
      this.serviceExpressMode.updateCharacteristic(Characteristic.On, this.Status.isExpressModeOn);
    }

    if (this.config.ref_express_fridge && 'expressFridge' in device.snapshot?.refState && this.serviceExpressFridge) {
      this.serviceExpressFridge.updateCharacteristic(Characteristic.On, this.Status.isExpressFridgeOn);
    }

    if (this.config.ref_eco_friendly && 'ecoFriendly' in device.snapshot?.refState && this.serviceEcoFriendly) {
      this.serviceEcoFriendly.updateCharacteristic(Characteristic.On, this.Status.isEcoFriendlyOn);
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
    this.platform.ThinQ?.deviceControl(device.id, {
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
    this.platform.log.debug('Set Express Freezer ->', value);
  }

  async setExpressFridge(value: CharacteristicValue) {
    const device: Device = this.accessory.context.device;
    const On = device.deviceModel.lookupMonitorName('expressFridge', '@CP_ON_EN_W');
    const Off = device.deviceModel.lookupMonitorName('expressFridge', '@CP_OFF_EN_W');
    this.platform.ThinQ?.deviceControl(device.id, {
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
    this.platform.log.debug('Set Express Fridge ->', value);
  }

  async setEcoFriendly(value: CharacteristicValue) {
    const device: Device = this.accessory.context.device;
    const On = device.deviceModel.lookupMonitorName('ecoFriendly', '@CP_ON_EN_W');
    const Off = device.deviceModel.lookupMonitorName('ecoFriendly', '@CP_OFF_EN_W');
    this.platform.ThinQ?.deviceControl(device.id, {
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
    this.platform.log.debug('Set Eco Friendly ->', value);
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
  protected createThermostat(name: string, key: string) {
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
        validValues: [Characteristic.CurrentHeatingCoolingState.COOL] // Hide other states
      });

    service.getCharacteristic(Characteristic.TargetHeatingCoolingState)
      .updateValue(Characteristic.TargetHeatingCoolingState.COOL)
      .setProps({
        validValues: [Characteristic.TargetHeatingCoolingState.COOL] // Hide Heat/Auto/Off
      });

    service.getCharacteristic(Characteristic.TemperatureDisplayUnits).setProps({
      minValue: Characteristic.TemperatureDisplayUnits.CELSIUS,
      maxValue: Characteristic.TemperatureDisplayUnits.FAHRENHEIT,
    }).onGet(this.tempUnit.bind(this));

    const valueMapping = device.deviceModel.monitoringValueMapping(key + '_C') || device.deviceModel.monitoringValueMapping(key);
    const values = Object.values(valueMapping)
      .map(value => {
        if (value && typeof value === 'object' && 'label' in value) {
          return parseInt(value.label as string);
        }

        return parseInt(value as string);
      })
      .filter(value => {
        return !isNaN(value);
      });

    service.getCharacteristic(Characteristic.TargetTemperature)
      .updateValue(Math.min(...values))
      .onSet(async (value: CharacteristicValue) => { // value in celsius
        let indexValue;
        if (this.Status.tempUnit === 'FAHRENHEIT') {
          indexValue = device.deviceModel.lookupMonitorName(key + '_F', cToF(value as number).toString())
            || device.deviceModel.lookupMonitorName(key, cToF(value as number).toString());
        } else {
          indexValue = device.deviceModel.lookupMonitorName(key + '_C', value.toString())
            || device.deviceModel.lookupMonitorName(key, value.toString());
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
    await this.platform.ThinQ?.deviceControl(device.id, {
      dataKey: null,
      dataValue: null,
      dataSetList: {
        refState: {
          [key]: parseInt(temp),
          tempUnit: this.Status.tempUnit,
        },
      },
      dataGetList: null,
    });
  }
}

export class RefrigeratorStatus {
  constructor(protected data, protected deviceModel: DeviceModel) {
  }

  public get freezerTemperature() {
    if (this.tempUnit === 'FAHRENHEIT') {
      return fToC(parseInt(this.deviceModel.lookupMonitorValue('freezerTemp_F', this.data?.freezerTemp, '0')));
    }

    return parseInt(this.deviceModel.lookupMonitorValue('freezerTemp_C', this.data?.freezerTemp, '0'));
  }

  public get fridgeTemperature() {
    if (this.tempUnit === 'FAHRENHEIT') {
      return fToC(parseInt(this.deviceModel.lookupMonitorValue( 'fridgeTemp_F', this.data?.fridgeTemp, '0')));
    }

    return parseInt(this.deviceModel.lookupMonitorValue('fridgeTemp_C', this.data?.fridgeTemp, '0'));
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
    const visibleItem = this.deviceModel.data.Config?.visibleItems?.find(item => item.Feature === key || item.feature === key);
    if (!visibleItem) {
      return false;
    } else if (visibleItem.ControlTitle === undefined && visibleItem.controlTitle === undefined) {
      return false;
    }

    return true;
  }
}