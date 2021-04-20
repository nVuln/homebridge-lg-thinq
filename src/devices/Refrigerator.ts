import {LGThinQHomebridgePlatform} from '../platform';
import {CharacteristicValue, PlatformAccessory} from 'homebridge';
import {Device} from '../lib/Device';
import {baseDevice} from '../baseDevice';

export default class Refrigerator extends baseDevice {
  public intervalTime = 10000; // every 10 second
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

    const serviceLabel = accessory.getService(ServiceLabel) || accessory.addService(ServiceLabel, 'Refrigerator');
    serviceLabel.setCharacteristic(Characteristic.ServiceLabelNamespace, Characteristic.ServiceLabelNamespace.DOTS);

    const serviceFreezer = this.createThermostat('Freezer');
    serviceFreezer.getCharacteristic(Characteristic.TargetTemperature)
      .onSet(this.setFreezerTemperature.bind(this))
      .setProps({ minValue: -24, maxValue: -14, minStep: 1 });
    serviceLabel.addLinkedService(serviceFreezer);

    const serviceFridge = this.createThermostat('Fridge');
    serviceFridge.getCharacteristic(Characteristic.TargetTemperature)
      .onSet(this.setFridgeTemperature.bind(this))
      .setProps({ minValue: 1, maxValue: 7, minStep: 1 });
    serviceLabel.addLinkedService(serviceFridge);

    // Door open state
    const serviceDoorOpened = accessory.getService(ContactSensor) || accessory.addService(ContactSensor, 'Refrigerator Opened');
    const contactSensorValue = device.data.snapshot?.refState?.atLeastOneDoorOpen === 'CLOSE' ?
      Characteristic.ContactSensorState.CONTACT_DETECTED : Characteristic.ContactSensorState.CONTACT_NOT_DETECTED;
    serviceDoorOpened.setCharacteristic(Characteristic.ContactSensorState, contactSensorValue);
    serviceLabel.addLinkedService(serviceDoorOpened);

    // Express Mode
    const serviceExpressMode = accessory.getService(Switch) || accessory.addService(Switch, 'Express Mode');
    serviceExpressMode.getCharacteristic(Characteristic.On).onSet(this.setExpressMode.bind(this));
    serviceLabel.addLinkedService(serviceExpressMode);

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

    const {Service: {Switch, ContactSensor}, Characteristic} = this.platform;

    const serviceFreezer = this.accessory.getService('Freezer');
    const freezerTemperature = -13 - parseInt(device.data.snapshot?.refState?.freezerTemp || 11);
    serviceFreezer?.updateCharacteristic(Characteristic.CurrentTemperature, freezerTemperature);
    serviceFreezer?.updateCharacteristic(Characteristic.TargetTemperature, freezerTemperature);

    const serviceFridge = this.accessory.getService('Fridge');
    const fridgeTemperature = 8 - parseInt(device.data.snapshot?.refState?.fridgeTemp || 1);
    serviceFridge?.updateCharacteristic(Characteristic.CurrentTemperature, fridgeTemperature);
    serviceFridge?.updateCharacteristic(Characteristic.TargetTemperature, fridgeTemperature);

    const serviceDoorOpened = this.accessory.getService(ContactSensor);
    const contactSensorValue = device.data.snapshot?.refState?.atLeastOneDoorOpen === 'CLOSE' ?
      Characteristic.ContactSensorState.CONTACT_DETECTED : Characteristic.ContactSensorState.CONTACT_NOT_DETECTED;
    serviceDoorOpened?.updateCharacteristic(Characteristic.ContactSensorState, contactSensorValue);

    const serviceExpressMode = this.accessory.getService(Switch);
    serviceExpressMode?.updateCharacteristic(Characteristic.On, device.data.snapshot?.refState?.expressMode === 'EXPRESS_ON');
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
