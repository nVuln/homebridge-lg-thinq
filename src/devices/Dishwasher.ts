import {baseDevice} from '../baseDevice';
import {LGThinQHomebridgePlatform} from '../platform';
import {PlatformAccessory} from 'homebridge';
import {Device} from '../lib/Device';

export default class Dishwasher extends baseDevice {
  protected serviceDishwasher;

  constructor(
    protected readonly platform: LGThinQHomebridgePlatform,
    protected readonly accessory: PlatformAccessory,
  ) {
    super(platform, accessory);

    const {
      Service: {
        Valve,
      },
      Characteristic,
    } = this.platform;

    const device = accessory.context.device;

    this.serviceDishwasher = accessory.getService(Valve) || accessory.addService(Valve, 'Dishwasher');
    this.serviceDishwasher.setCharacteristic(Characteristic.Name, device.name);
    this.serviceDishwasher.setCharacteristic(Characteristic.ValveType, Characteristic.ValveType.WATER_FAUCET);
    this.serviceDishwasher.getCharacteristic(Characteristic.RemainingDuration).setProps({
      maxValue: 86400, // 1 day
    });

    this.updateAccessoryCharacteristic(device);
  }

  public updateAccessoryCharacteristic(device: Device) {
    super.updateAccessoryCharacteristic(device);

    const {Characteristic} = this.platform;
    const isPowerOn = !['POWEROFF', 'POWERFAIL'].includes(device.snapshot.dishwasher?.state);
    const isRunning = device.snapshot.dishwasher?.state === 'RUNNING';
    this.serviceDishwasher.updateCharacteristic(Characteristic.Active, isPowerOn ? 1 : 0);
    this.serviceDishwasher.updateCharacteristic(Characteristic.InUse, isRunning ? 1 : 0);

    const remainTimeInMinute = device.snapshot.dishwasher?.remainTimeHour * 60 + device.snapshot.dishwasher?.remainTimeMinute;
    this.serviceDishwasher.updateCharacteristic(Characteristic.RemainingDuration, remainTimeInMinute * 60);
  }
}
