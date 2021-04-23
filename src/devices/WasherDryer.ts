import {baseDevice} from '../baseDevice';
import {LGThinQHomebridgePlatform} from '../platform';
import {PlatformAccessory} from 'homebridge';
import {Device} from '../lib/Device';

export default class WasherDryer extends baseDevice {
  protected serviceWasher;
  protected serviceDryer;
  protected serviceWasherDoorLocked;
  protected serviceWashingTemperature;

  constructor(
    protected readonly platform: LGThinQHomebridgePlatform,
    protected readonly accessory: PlatformAccessory,
  ) {
    super(platform, accessory);

    const {
      Service: {
        ContactSensor,
        TemperatureSensor,
        Valve,
      },
      Characteristic,
    } = this.platform;

    const device: Device = accessory.context.device;

    if (typeof device.snapshot.washerDryer !== 'object') {
      this.platform.log.debug('device data: ', JSON.stringify(device));
    }

    this.serviceWasher = accessory.getService('Washer') || accessory.addService(Valve, 'Washer', 'Washer');
    this.serviceWasher.setCharacteristic(Characteristic.Name, device.name);
    this.serviceWasher.setCharacteristic(Characteristic.ValveType, Characteristic.ValveType.WATER_FAUCET);
    this.serviceWasher.getCharacteristic(Characteristic.RemainingDuration).setProps({
      maxValue: 86400, // 1 day
    });

    this.serviceDryer = accessory.getService('Dryer') || accessory.addService(Valve, 'Dryer', 'Dryer');
    this.serviceDryer.setCharacteristic(Characteristic.Name, 'Dryer');
    this.serviceDryer.setCharacteristic(Characteristic.ValveType, Characteristic.ValveType.WATER_FAUCET);
    this.serviceDryer.getCharacteristic(Characteristic.RemainingDuration).setProps({
      maxValue: 86400, // 1 day
    });
    this.serviceDryer.addLinkedService(this.serviceWasher);

    this.serviceWasherDoorLocked = accessory.getService(ContactSensor) || accessory.addService(ContactSensor, 'Door Locked');
    this.serviceWasherDoorLocked.addLinkedService(this.serviceWasher);

    this.serviceWashingTemperature = accessory.getService(TemperatureSensor)
      || accessory.addService(TemperatureSensor, 'Washing Temperature');
    this.serviceWashingTemperature.addLinkedService(this.serviceWasher);

    this.updateAccessoryCharacteristic(device);
  }

  public updateAccessoryCharacteristic(device: Device) {
    super.updateAccessoryCharacteristic(device);

    const {Characteristic} = this.platform;
    const isPowerOn = device.snapshot.washerDryer?.state !== 'POWEROFF';
    const isWasherRunning = isPowerOn && device.snapshot.washerDryer?.state === 'RUNNING';
    const isDryerRunning = isPowerOn && device.snapshot.washerDryer?.state === 'DRYING';
    this.serviceWasher.updateCharacteristic(Characteristic.Active, isPowerOn ? 1 : 0);
    this.serviceWasher.updateCharacteristic(Characteristic.InUse, isWasherRunning ? 1 : 0);

    this.serviceDryer.updateCharacteristic(Characteristic.Active, isPowerOn ? 1 : 0);
    this.serviceDryer.updateCharacteristic(Characteristic.InUse, isDryerRunning ? 1 : 0);

    const remainTimeInMinute = device.snapshot.washerDryer?.remainTimeHour * 60 + device.snapshot.washerDryer?.remainTimeMinute;
    if (isWasherRunning) {
      this.serviceWasher.updateCharacteristic(Characteristic.RemainingDuration, remainTimeInMinute * 60);
    }
    else {
      this.serviceDryer.updateCharacteristic(Characteristic.RemainingDuration, remainTimeInMinute * 60);
    }

    const isDoorLocked = device.snapshot.washerDryer?.doorLock === 'DOOR_LOCK_ON';
    this.serviceWasherDoorLocked.updateCharacteristic(Characteristic.ContactSensorState, isDoorLocked ? 0 : 1);

    const temp = (device.snapshot.washerDryer?.temp.match(/[A-Z_]+_([0-9]+)/)[1] || 0) as number;
    this.serviceWashingTemperature.updateCharacteristic(Characteristic.CurrentTemperature, temp);

  }
}
