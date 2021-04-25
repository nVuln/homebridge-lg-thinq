import {baseDevice} from '../baseDevice';
import {LGThinQHomebridgePlatform} from '../platform';
import {PlatformAccessory} from 'homebridge';
import {Device} from '../lib/Device';

export default class WasherDryer extends baseDevice {
  protected serviceWasher;
  protected serviceDoorLocked;
  protected serviceChildLocked;
  protected serviceWashingTemperature;

  constructor(
    protected readonly platform: LGThinQHomebridgePlatform,
    protected readonly accessory: PlatformAccessory,
  ) {
    super(platform, accessory);

    const {
      Service: {
        Switch,
        TemperatureSensor,
        Valve,
      },
      Characteristic,
    } = this.platform;

    const device: Device = accessory.context.device;

    if (typeof device.snapshot?.washerDryer !== 'object') {
      this.platform.log.debug('washerDryer data not exists: ', JSON.stringify(device));
      return;
    }

    this.serviceWasher = accessory.getService(Valve) || accessory.addService(Valve, 'Washer');
    this.serviceWasher.setCharacteristic(Characteristic.Name, device.name);
    this.serviceWasher.setCharacteristic(Characteristic.ValveType, Characteristic.ValveType.WATER_FAUCET);
    this.serviceWasher.getCharacteristic(Characteristic.RemainingDuration).setProps({
      maxValue: 86400, // 1 day
    });

    this.serviceDoorLocked = accessory.getService('Door Lock') || accessory.addService(Switch, 'Door Lock', 'Door Lock');
    this.serviceDoorLocked.setCharacteristic(Characteristic.Name, 'Door Lock');
    this.serviceDoorLocked.addLinkedService(this.serviceWasher);

    this.serviceChildLocked = accessory.getService('Child Lock') || accessory.addService(Switch, 'Child Lock', 'Child Lock');
    this.serviceChildLocked.setCharacteristic(Characteristic.Name, 'Child Lock');
    this.serviceChildLocked.addLinkedService(this.serviceWasher);

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
    this.serviceWasher.updateCharacteristic(Characteristic.InUse, (isWasherRunning || isDryerRunning) ? 1 : 0);

    const remainTimeInMinute = device.snapshot.washerDryer?.remainTimeHour * 60 + device.snapshot.washerDryer?.remainTimeMinute;
    this.serviceWasher.updateCharacteristic(Characteristic.RemainingDuration, remainTimeInMinute * 60);

    const isDoorLocked = device.snapshot.washerDryer?.doorLock === 'DOOR_LOCK_ON';
    this.serviceDoorLocked.updateCharacteristic(Characteristic.On, isDoorLocked as boolean);
    this.serviceDoorLocked.setHiddenService(!isPowerOn);

    const isChildLocked = device.snapshot.washerDryer?.childLock === 'CHILDLOCK_ON';
    this.serviceChildLocked.updateCharacteristic(Characteristic.On, isChildLocked as boolean);
    this.serviceChildLocked.setHiddenService(!isPowerOn);

    let temp = device.snapshot.washerDryer?.temp.match(/[A-Z_]+_([0-9]+)/);
    temp = temp && temp.length ? temp[1] : 0;
    this.serviceWashingTemperature.updateCharacteristic(Characteristic.CurrentTemperature, temp as number);
    this.serviceWashingTemperature.setHiddenService(!isPowerOn);
  }
}
