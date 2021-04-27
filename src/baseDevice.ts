import {LGThinQHomebridgePlatform} from './platform';
import {PlatformAccessory} from 'homebridge';
import {Device} from './lib/Device';

export class baseDevice {
  public intervalTime = 10000;
  constructor(
    protected readonly platform: LGThinQHomebridgePlatform,
    protected readonly accessory: PlatformAccessory,
  ) {
    const device = accessory.context.device;
    const {AccessoryInformation} = this.platform.Service;
    const serviceAccessoryInformation = accessory.getService(AccessoryInformation) || accessory.addService(AccessoryInformation);

    // set accessory information
    serviceAccessoryInformation
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'LG')
      .setCharacteristic(this.platform.Characteristic.Model, device.model || 'Unknown')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, device.serialNumber || 'Unknown');
  }

  public updateAccessoryCharacteristic(device: Device) {
    this.accessory.context.device = device;
  }
}
