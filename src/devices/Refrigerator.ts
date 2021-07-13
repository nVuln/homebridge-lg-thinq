import {LGThinQHomebridgePlatform} from '../platform';
import {CharacteristicValue, PlatformAccessory} from 'homebridge';
import {Device} from '../lib/Device';
import {baseDevice} from '../baseDevice';
import {DeviceModel} from '../lib/DeviceModel';

export default class Refrigerator extends baseDevice {
  protected serviceLabel;
  protected serviceFreezer;
  protected serviceFridge;
  protected serviceDoorOpened;
  protected serviceExpressMode;
  protected serviceExpressFridge;

  constructor(
    protected readonly platform: LGThinQHomebridgePlatform,
    protected readonly accessory: PlatformAccessory,
  ) {
    super(platform, accessory);

    const {
      Service: {
        ContactSensor,
        Switch,
        ServiceLabel,
      },
      Characteristic,
    } = this.platform;
    const device: Device = accessory.context.device;

    this.serviceLabel = accessory.getService(ServiceLabel) || accessory.addService(ServiceLabel, device.name);
    this.serviceLabel.setCharacteristic(Characteristic.ServiceLabelNamespace, Characteristic.ServiceLabelNamespace.DOTS);

    this.serviceFridge = this.createThermostat('Fridge', 'fridgeTemp');
    this.serviceFridge.updateCharacteristic(Characteristic.ServiceLabelIndex, 1);
    this.serviceFridge.addLinkedService(this.serviceLabel);

    this.serviceFreezer = this.createThermostat('Freezer', 'freezerTemp');
    this.serviceFreezer.updateCharacteristic(Characteristic.ServiceLabelIndex, 2);
    this.serviceFreezer.addLinkedService(this.serviceLabel);

    // Door open state
    this.serviceDoorOpened = accessory.getService(ContactSensor) || accessory.addService(ContactSensor, 'Refrigerator Door Closed');
    this.serviceDoorOpened.addLinkedService(this.serviceLabel);

    // Express Mode
    this.serviceExpressMode = accessory.getService(Switch) || accessory.addService(Switch, 'Express Mode');
    this.serviceExpressMode.getCharacteristic(Characteristic.On).onSet(this.setExpressMode.bind(this));
    this.serviceExpressMode.addLinkedService(this.serviceLabel);

    if ('expressFridge' in device.snapshot?.refState) {
      // Express Fridge
      this.serviceExpressFridge = accessory.getService(Switch) || accessory.addService(Switch, 'Express Fridge');
      this.serviceExpressFridge.getCharacteristic(Characteristic.On).onSet(this.setExpressFridge.bind(this));
      this.serviceExpressFridge.addLinkedService(this.serviceLabel);
    }

    this.updateAccessoryCharacteristic(device);
  }

  public get Status() {
    return new RefrigeratorStatus(this.accessory.context.device.snapshot?.refState, this.accessory.context.device.deviceModel);
  }

  /**
   * update accessory characteristic by device
   */
  public updateAccessoryCharacteristic(device: Device) {
    super.updateAccessoryCharacteristic(device);

    const {Characteristic} = this.platform;

    this.serviceFreezer.updateCharacteristic(Characteristic.CurrentTemperature, this.Status.freezerTemperature);
    this.serviceFreezer.updateCharacteristic(Characteristic.TargetTemperature, this.Status.freezerTemperature);

    this.serviceFridge.updateCharacteristic(Characteristic.CurrentTemperature, this.Status.fridgeTemperature);
    this.serviceFridge.updateCharacteristic(Characteristic.TargetTemperature, this.Status.fridgeTemperature);

    const contactSensorValue = this.Status.isDoorClosed ?
      Characteristic.ContactSensorState.CONTACT_DETECTED : Characteristic.ContactSensorState.CONTACT_NOT_DETECTED;
    this.serviceDoorOpened.updateCharacteristic(Characteristic.ContactSensorState, contactSensorValue);

    this.serviceExpressMode.updateCharacteristic(Characteristic.On, this.Status.isExpressModeOn);

    if ('expressFridge' in device.snapshot?.refState) {
      this.serviceExpressFridge.updateCharacteristic(Characteristic.On, this.Status.isExpressFridgeOn);
    }
  }

  async setExpressMode(value: CharacteristicValue) {
    const device: Device = this.accessory.context.device;
    const On = device.deviceModel.lookupMonitorEnumName('expressMode', '@CP_ON_EN_W');
    const Off = device.deviceModel.lookupMonitorEnumName('expressMode', '@CP_OFF_EN_W');
    this.platform.ThinQ?.deviceControl(device.id, {
      dataKey: null,
      dataValue: null,
      dataSetList: {
        refState: {
          expressMode: value as boolean ? On : Off,
          tempUnit: 'CELSIUS',
        },
      },
      dataGetList: null,
    });
    this.platform.log.debug('Set Express Mode ->', value);
  }

  async setExpressFridge(value: CharacteristicValue) {
    const device: Device = this.accessory.context.device;
    const On = device.deviceModel.lookupMonitorEnumName('expressFridge', '@CP_ON_EN_W');
    const Off = device.deviceModel.lookupMonitorEnumName('expressFridge', '@CP_OFF_EN_W');
    this.platform.ThinQ?.deviceControl(device.id, {
      dataKey: null,
      dataValue: null,
      dataSetList: {
        refState: {
          expressFridge: value as boolean ? On : Off,
          tempUnit: 'CELSIUS',
        },
      },
      dataGetList: null,
    });
    this.platform.log.debug('Set Express Mode ->', value);
  }

  /**
   * create a thermostat service
   */
  protected createThermostat(name: string, key: string) {
    const device: Device = this.accessory.context.device;
    const {Characteristic} = this.platform;
    const service = this.accessory.getService(name) || this.accessory.addService(this.platform.Service.Thermostat, name, name);
    // cool only
    service.setCharacteristic(Characteristic.CurrentHeatingCoolingState, Characteristic.CurrentHeatingCoolingState.COOL);
    service.getCharacteristic(Characteristic.TargetHeatingCoolingState)
      .setProps({
        minValue: Characteristic.TargetHeatingCoolingState.COOL,
        maxValue: Characteristic.TargetHeatingCoolingState.COOL,
      });
    service.setCharacteristic(Characteristic.TargetHeatingCoolingState, Characteristic.TargetHeatingCoolingState.COOL);
    // celsius only
    service.getCharacteristic(Characteristic.TemperatureDisplayUnits).setProps({
      minValue: Characteristic.TemperatureDisplayUnits.CELSIUS,
      maxValue: Characteristic.TemperatureDisplayUnits.CELSIUS,
    });

    const values = Object.values(device.deviceModel.monitoringValue[key + '_C'].valueMapping).filter(value => {
      return value.label !== 'IGNORE';
    }).map(value => {
      return parseInt(value.label);
    });

    service.getCharacteristic(Characteristic.TargetTemperature)
      .onSet((value: CharacteristicValue) => {
        const indexValue = device.deviceModel.lookupMonitorEnumName(key + '_C', value.toString());

        if (!indexValue) {
          throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.INVALID_VALUE_IN_REQUEST);
        }

        this.platform.ThinQ?.deviceControl(device.id, {
          dataKey: null,
          dataValue: null,
          dataSetList: {
            refState: {
              [key]: parseInt(indexValue),
              tempUnit: 'CELSIUS',
            },
          },
          dataGetList: null,
        });
      })
      .setProps({minValue: Math.min(...values), maxValue: Math.max(...values), minStep: 1});

    return service;
  }
}

export class RefrigeratorStatus {
  constructor(protected data, protected deviceModel: DeviceModel) {
  }

  public get freezerTemperature() {
    const valueMapping = this.deviceModel.monitoringValue.freezerTemp_C.valueMapping;
    return parseInt(valueMapping[this.data?.freezerTemp]?.label || '0');
  }

  public get fridgeTemperature() {
    const valueMapping = this.deviceModel.monitoringValue.fridgeTemp_C.valueMapping;
    return parseInt(valueMapping[this.data?.fridgeTemp]?.label || '0');
  }

  public get isDoorClosed() {
    return this.data?.atLeastOneDoorOpen === 'CLOSE';
  }

  public get isExpressModeOn() {
    return this.data?.expressMode === this.deviceModel.lookupMonitorEnumName('expressMode', '@CP_ON_EN_W');
  }

  public get isExpressFridgeOn() {
    return this.data?.expressFridge === this.deviceModel.lookupMonitorEnumName('expressFridge', '@CP_ON_EN_W');
  }
}
