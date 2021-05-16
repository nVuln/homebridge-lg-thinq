import {LGThinQHomebridgePlatform} from '../platform';
import {CharacteristicValue, PlatformAccessory} from 'homebridge';
import {Device} from '../lib/Device';
import {baseDevice} from '../baseDevice';

export default class Refrigerator extends baseDevice {
  protected serviceLabel;
  protected serviceFreezer;
  protected serviceFridge;
  protected serviceDoorOpened;
  protected serviceExpressMode;

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

    this.serviceLabel = accessory.getService(ServiceLabel) || accessory.addService(ServiceLabel, 'Refrigerator');
    this.serviceLabel.setCharacteristic(Characteristic.ServiceLabelNamespace, Characteristic.ServiceLabelNamespace.DOTS);

    this.serviceFridge = this.createThermostat('Fridge');
    this.serviceFridge.getCharacteristic(Characteristic.TargetTemperature)
      .onSet(this.setFridgeTemperature.bind(this))
      .setProps({ minValue: 1, maxValue: 7, minStep: 1 });
    this.serviceFridge.updateCharacteristic(Characteristic.ServiceLabelIndex, 1);
    this.serviceFridge.addLinkedService(this.serviceLabel);

    this.serviceFreezer = this.createThermostat('Freezer');
    this.serviceFreezer.getCharacteristic(Characteristic.TargetTemperature)
      .onSet(this.setFreezerTemperature.bind(this))
      .setProps({ minValue: -24, maxValue: -14, minStep: 1 });
    this.serviceFreezer.updateCharacteristic(Characteristic.ServiceLabelIndex, 2);
    this.serviceFreezer.addLinkedService(this.serviceLabel);

    // Door open state
    this.serviceDoorOpened = accessory.getService(ContactSensor) || accessory.addService(ContactSensor, 'Refrigerator Door Closed');
    this.serviceDoorOpened.addLinkedService(this.serviceLabel);

    // Express Mode
    this.serviceExpressMode = accessory.getService(Switch) || accessory.addService(Switch, 'Express Mode');
    this.serviceExpressMode.getCharacteristic(Characteristic.On).onSet(this.setExpressMode.bind(this));
    this.serviceExpressMode.addLinkedService(this.serviceLabel);

    this.updateAccessoryCharacteristic(device);
  }

  /**
   * create a thermostat service
   */
  protected createThermostat(name: string) {
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

    return service;
  }

  /**
   * update accessory characteristic by device
   */
  public updateAccessoryCharacteristic(device: Device) {
    super.updateAccessoryCharacteristic(device);

    const {Characteristic} = this.platform;
    const Status = new RefrigeratorStatus(device.data.snapshot?.refState);

    this.serviceFreezer.updateCharacteristic(Characteristic.CurrentTemperature, Status.freezerTemperature);
    this.serviceFreezer.updateCharacteristic(Characteristic.TargetTemperature, Status.freezerTemperature);

    this.serviceFridge.updateCharacteristic(Characteristic.CurrentTemperature, Status.fridgeTemperature);
    this.serviceFridge.updateCharacteristic(Characteristic.TargetTemperature, Status.fridgeTemperature);

    const contactSensorValue = Status.isDoorClosed ?
      Characteristic.ContactSensorState.CONTACT_DETECTED : Characteristic.ContactSensorState.CONTACT_NOT_DETECTED;
    this.serviceDoorOpened.updateCharacteristic(Characteristic.ContactSensorState, contactSensorValue);

    this.serviceExpressMode.updateCharacteristic(Characteristic.On, Status.isExpressModeOn);
  }

  async setExpressMode(value: CharacteristicValue) {
    const device: Device = this.accessory.context.device;
    const expressModeValue = value as boolean ? 'EXPRESS_ON' : 'OFF';
    this.platform.ThinQ?.deviceControl(device.id, {
      dataKey: null,
      dataValue: null,
      dataSetList: {
        refState: {
          expressMode: expressModeValue,
          tempUnit: 'CELSIUS',
        },
      },
      dataGetList: null,
    });
    this.platform.log.debug('Set Express Mode ->', value);
  }

  async setFreezerTemperature(value: CharacteristicValue) {
    const device: Device = this.accessory.context.device;
    this.platform.ThinQ?.deviceControl(device.id, {
      dataKey: null,
      dataValue: null,
      dataSetList: {
        refState: {
          freezerTemp: -13 - parseInt(value.toString()),
          tempUnit: 'CELSIUS',
        },
      },
      dataGetList: null,
    });
  }

  async setFridgeTemperature(value: CharacteristicValue) {
    const device: Device = this.accessory.context.device;
    this.platform.ThinQ?.deviceControl(device.id, {
      dataKey: null,
      dataValue: null,
      dataSetList: {
        refState: {
          fridgeTemp: 8 - parseInt(value.toString()),
          tempUnit: 'CELSIUS',
        },
      },
      dataGetList: null,
    });
  }
}

export class RefrigeratorStatus {
  constructor(protected data) {}

  public get freezerTemperature() {
    return -13 - parseInt(this.data?.freezerTemp || 11);
  }

  public get fridgeTemperature() {
    return 8 - parseInt(this.data?.fridgeTemp || 1);
  }

  public get isDoorClosed() {
    return this.data?.atLeastOneDoorOpen === 'CLOSE';
  }

  public get isExpressModeOn() {
    return this.data?.expressMode === 'EXPRESS_ON';
  }
}
