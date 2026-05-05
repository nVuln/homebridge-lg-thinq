import { LGThinQHomebridgePlatform } from '../platform.js';
import { CharacteristicValue, Logger, PlatformAccessory, Service } from 'homebridge';
import { Device } from '../lib/Device.js';
import { AccessoryContext, BaseDevice } from '../baseDevice.js';
import { DeviceModel } from '../lib/DeviceModel.js';
import { cToF, fToC } from '../utils/temperature.js';
import {
  contactSensorStateValue,
  hasSnapshotKey,
  snapshotNumber,
  snapshotString,
  updateCharacteristicIfChanged,
} from './helpers.js';

export type RefrigeratorRefStateValue = string | number | null | undefined;

export type RefrigeratorCommandPayload = {
  dataKey: null;
  dataValue: null;
  dataSetList: {
    refState: Record<string, RefrigeratorRefStateValue>;
  };
  dataGetList: null;
};

export function refrigeratorRefStateCommand(refState: Record<string, RefrigeratorRefStateValue>): RefrigeratorCommandPayload {
  return {
    dataKey: null,
    dataValue: null,
    dataSetList: {
      refState,
    },
    dataGetList: null,
  };
}

export function refrigeratorFeatureCommand(
  featureKey: string,
  value: CharacteristicValue,
  onValue: RefrigeratorRefStateValue,
  offValue: RefrigeratorRefStateValue,
  tempUnit: string,
): RefrigeratorCommandPayload {
  return refrigeratorRefStateCommand({
    [featureKey]: value ? onValue : offValue,
    tempUnit,
  });
}

export function refrigeratorTemperatureCommand(
  key: string,
  temp: string | number,
  tempUnit: string,
): RefrigeratorCommandPayload {
  return refrigeratorRefStateCommand({
    [key]: parseInt(String(temp), 10),
    tempUnit,
  });
}

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
    const refState = device.snapshot?.refState;

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
    if (this.config.ref_express_freezer && hasSnapshotKey(refState, 'expressMode')) {
      if (!this.serviceExpressMode) {
        this.serviceExpressMode = accessory.addService(Switch, 'Express Freezer', 'Express Freezer');
        this.serviceExpressMode.addOptionalCharacteristic(Characteristic.ConfiguredName);
        this.serviceExpressMode.updateCharacteristic(Characteristic.ConfiguredName, 'Express Freezer');
      }

      this.serviceExpressMode.getCharacteristic(Characteristic.On)
        .onGet(this.onlineGet(() => this.Status.isExpressModeOn))
        .onSet(this.setExpressMode.bind(this));
    } else if (this.serviceExpressMode) {
      accessory.removeService(this.serviceExpressMode);
      this.serviceExpressMode = undefined;
    }

    this.serviceExpressFridge = accessory.getService('Express Fridge');
    if (this.config.ref_express_fridge && hasSnapshotKey(refState, 'expressFridge')) {
      if (!this.serviceExpressFridge) {
        this.serviceExpressFridge = accessory.addService(Switch, 'Express Fridge', 'Express Fridge');
        this.serviceExpressFridge.addOptionalCharacteristic(Characteristic.ConfiguredName);
        this.serviceExpressFridge.updateCharacteristic(Characteristic.ConfiguredName, 'Express Fridge');
      }

      this.serviceExpressFridge.getCharacteristic(Characteristic.On)
        .onGet(this.onlineGet(() => this.Status.isExpressFridgeOn))
        .onSet(this.setExpressFridge.bind(this));
    } else if (this.serviceExpressFridge) {
      accessory.removeService(this.serviceExpressFridge);
      this.serviceExpressFridge = undefined;
    }

    this.serviceEcoFriendly = accessory.getService('Eco Friendly');
    if (this.config.ref_eco_friendly && hasSnapshotKey(refState, 'ecoFriendly')) {
      if (!this.serviceEcoFriendly) {
        this.serviceEcoFriendly = accessory.addService(Switch, 'Eco Friendly', 'Eco Friendly');
        this.serviceEcoFriendly.addOptionalCharacteristic(Characteristic.ConfiguredName);
        this.serviceEcoFriendly.updateCharacteristic(Characteristic.ConfiguredName, 'Eco Friendly');
      }

      this.serviceEcoFriendly.getCharacteristic(Characteristic.On)
        .onGet(this.onlineGet(() => this.Status.isEcoFriendlyOn))
        .onSet(this.setEcoFriendly.bind(this));
    } else if (this.serviceEcoFriendly) {
      accessory.removeService(this.serviceEcoFriendly);
      this.serviceEcoFriendly = undefined;
    }

    if (this.Status.hasFeature('waterFilter')) {
      this.serviceWaterFilter = accessory.getService('Water Filter Maintenance');
      if (!this.serviceWaterFilter) {
        this.serviceWaterFilter = accessory.addService(FilterMaintenance, 'Water Filter Maintenance', 'Water Filter Maintenance');
        this.serviceWaterFilter.addOptionalCharacteristic(Characteristic.ConfiguredName);
        this.serviceWaterFilter.updateCharacteristic(Characteristic.ConfiguredName, 'Water Filter Maintenance');
      }

      this.serviceWaterFilter.updateCharacteristic(Characteristic.Name, 'Water Filter Maintenance');
      this.serviceWaterFilter.getCharacteristic(Characteristic.FilterLifeLevel)
        .onGet(this.onlineGet(() => this.Status.waterFilterRemain));
      this.serviceWaterFilter.getCharacteristic(Characteristic.FilterChangeIndication)
        .onGet(this.onlineGet(() => {
          return this.Status.waterFilterRemain < 5
            ? Characteristic.FilterChangeIndication.CHANGE_FILTER
            : Characteristic.FilterChangeIndication.FILTER_OK;
        }));
    }

    this.serviceDoorOpened.getCharacteristic(Characteristic.ContactSensorState)
      .onGet(this.onlineGet(() => contactSensorStateValue(this.Status.isDoorClosed, Characteristic.ContactSensorState)));
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
      updateCharacteristicIfChanged(this.serviceFreezer, Characteristic.CurrentTemperature, t);
      updateCharacteristicIfChanged(this.serviceFreezer, Characteristic.TargetTemperature, t);
    }

    if (this.serviceFridge) {
      const t = tempBetween(this.serviceFridge.getCharacteristic(Characteristic.TargetTemperature).props, this.Status.fridgeTemperature);
      updateCharacteristicIfChanged(this.serviceFridge, Characteristic.CurrentTemperature, t);
      updateCharacteristicIfChanged(this.serviceFridge, Characteristic.TargetTemperature, t);
    }

    if (this.serviceDoorOpened) {
      const contactSensorValue = contactSensorStateValue(this.Status.isDoorClosed, Characteristic.ContactSensorState);
      updateCharacteristicIfChanged(this.serviceDoorOpened, Characteristic.ContactSensorState, contactSensorValue);
    }
    const refState = device.snapshot?.refState;
    if (refState) {
      if (this.config.ref_express_freezer && hasSnapshotKey(refState, 'expressMode') && this.serviceExpressMode) {
        updateCharacteristicIfChanged(this.serviceExpressMode, Characteristic.On, this.Status.isExpressModeOn);
      }

      if (this.config.ref_express_fridge && hasSnapshotKey(refState, 'expressFridge') && this.serviceExpressFridge) {
        updateCharacteristicIfChanged(this.serviceExpressFridge, Characteristic.On, this.Status.isExpressFridgeOn);
      }

      if (this.config.ref_eco_friendly && hasSnapshotKey(refState, 'ecoFriendly') && this.serviceEcoFriendly) {
        updateCharacteristicIfChanged(this.serviceEcoFriendly, Characteristic.On, this.Status.isEcoFriendlyOn);
      }
    }

    if (this.Status.hasFeature('waterFilter') && this.serviceWaterFilter) {
      updateCharacteristicIfChanged(this.serviceWaterFilter, FilterLifeLevel, this.Status.waterFilterRemain);
      updateCharacteristicIfChanged(this.serviceWaterFilter, FilterChangeIndication,
        this.Status.waterFilterRemain < 5 ? FilterChangeIndication.CHANGE_FILTER : FilterChangeIndication.FILTER_OK);
    }
  }

  async setExpressMode(value: CharacteristicValue) {
    this.requireDeviceOnline();
    const device: Device = this.accessory.context.device;
    const On = device.deviceModel.lookupMonitorName('expressMode', '@CP_ON_EN_W');
    const Off = device.deviceModel.lookupMonitorName('expressMode', '@CP_OFF_EN_W');
    await this.platform.ThinQ?.deviceControl(device.id, refrigeratorFeatureCommand('expressMode', value, On, Off, this.Status.tempUnit));
    this.platform.log.debug('Set Express Freezer ->', value);
  }

  async setExpressFridge(value: CharacteristicValue) {
    this.requireDeviceOnline();
    const device: Device = this.accessory.context.device;
    const On = device.deviceModel.lookupMonitorName('expressFridge', '@CP_ON_EN_W');
    const Off = device.deviceModel.lookupMonitorName('expressFridge', '@CP_OFF_EN_W');
    await this.platform.ThinQ?.deviceControl(device.id, refrigeratorFeatureCommand('expressFridge', value, On, Off, this.Status.tempUnit));
    this.platform.log.debug('Set Express Fridge ->', value);
  }

  async setEcoFriendly(value: CharacteristicValue) {
    this.requireDeviceOnline();
    const device: Device = this.accessory.context.device;
    const On = device.deviceModel.lookupMonitorName('ecoFriendly', '@CP_ON_EN_W');
    const Off = device.deviceModel.lookupMonitorName('ecoFriendly', '@CP_OFF_EN_W');
    await this.platform.ThinQ?.deviceControl(device.id, refrigeratorFeatureCommand('ecoFriendly', value, On, Off, this.Status.tempUnit));
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

    service.getCharacteristic(Characteristic.CurrentHeatingCoolingState)
      .onGet(this.onlineGet(() => Characteristic.CurrentHeatingCoolingState.COOL));

    service.getCharacteristic(Characteristic.TargetHeatingCoolingState)
      .onGet(this.onlineGet(() => Characteristic.TargetHeatingCoolingState.COOL));

    const currentTemperature = () => name === 'Freezer' ? this.Status.freezerTemperature : this.Status.fridgeTemperature;

    service.getCharacteristic(Characteristic.CurrentTemperature)
      .onGet(this.onlineGet(currentTemperature));

    service.getCharacteristic(Characteristic.TemperatureDisplayUnits).setProps({
      minValue: Characteristic.TemperatureDisplayUnits.CELSIUS,
      maxValue: Characteristic.TemperatureDisplayUnits.FAHRENHEIT,
    }).onGet(this.onlineGet(() => this.tempUnit()));

    const valueMapping = device.deviceModel.monitoringValueMapping(key + '_C') || device.deviceModel.monitoringValueMapping(key);
    if (!valueMapping) {
      this.logger.error(`[Refrigerator] [${this.accessory.context.device.name}] No value mapping found for ${key}`);
      return service;
    }

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
      .onGet(this.onlineGet(currentTemperature))
      .onSet(async (value: CharacteristicValue) => { // value in celsius
        this.requireDeviceOnline();
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
    this.requireDeviceOnline();
    const device: Device = this.accessory.context.device;
    await this.platform.ThinQ?.deviceControl(device.id, refrigeratorTemperatureCommand(key, temp, this.Status.tempUnit));
  }
}

export class RefrigeratorStatus {
  constructor(protected data: any, protected deviceModel: DeviceModel) {
  }

  public get freezerTemperature() {
    if (this.tempUnit === 'FAHRENHEIT') {
      return fToC(this.lookupTemperature('freezerTemp_F', this.data?.freezerTemp));
    }

    return this.lookupTemperature('freezerTemp_C', this.data?.freezerTemp);
  }

  public get fridgeTemperature() {
    if (this.tempUnit === 'FAHRENHEIT') {
      return fToC(this.lookupTemperature('fridgeTemp_F', this.data?.fridgeTemp));
    }

    return this.lookupTemperature('fridgeTemp_C', this.data?.fridgeTemp);
  }

  public get isDoorClosed() {
    return snapshotString(this.data, 'atLeastOneDoorOpen') === 'CLOSE';
  }

  public get isExpressModeOn() {
    return snapshotString(this.data, 'expressMode') === this.deviceModel.lookupMonitorName('expressMode', '@CP_ON_EN_W');
  }

  public get isExpressFridgeOn() {
    return snapshotString(this.data, 'expressFridge') === this.deviceModel.lookupMonitorName('expressFridge', '@CP_ON_EN_W');
  }

  public get isEcoFriendlyOn() {
    return snapshotString(this.data, 'ecoFriendly') === this.deviceModel.lookupMonitorName('ecoFriendly', '@CP_ON_EN_W');
  }

  public get tempUnit() {
    return snapshotString(this.data, 'tempUnit', 'CELSIUS');
  }

  public get waterFilterRemain() {
    if (hasSnapshotKey(this.data, 'waterFilter1RemainP')) {
      return snapshotNumber(this.data, 'waterFilter1RemainP');
    }

    if (hasSnapshotKey(this.data, 'waterFilter')) {
      const match = snapshotString(this.data, 'waterFilter').match(/(\d)_/);
      const usedInMonth = match ? parseInt(match[1], 10) : NaN;
      if (isNaN(usedInMonth)) {
        return 0;
      }

      return (12 - usedInMonth) / 12 * 100;
    }

    return 0;
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

  protected lookupTemperature(key: string, value: unknown) {
    const monitorValue = value === undefined || value === null ? '0' : String(value);
    const mapped = this.deviceModel.lookupMonitorValue2(key, monitorValue, '0');
    const parsed = parseInt(String(mapped), 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
}
