import AirConditioner from '../devices/AirConditioner';
import {LGThinQHomebridgePlatform} from '../platform';
import {CharacteristicValue, PlatformAccessory} from 'homebridge';
import {Device} from '../lib/Device';

/**
 * added Jet Mode
 */
export default class RAC_056905_WW extends AirConditioner {
  public static model() {
    return 'RAC_056905_WW';
  }

  protected serviceSwitch;

  constructor(
    protected readonly platform: LGThinQHomebridgePlatform,
    protected readonly accessory: PlatformAccessory,
  ) {
    super(platform, accessory);

    const device: Device = this.accessory.context.device;

    const {
      Service: {
        Switch,
      },
    } = this.platform;

    // jet mode
    this.serviceSwitch = accessory.getService(Switch) || accessory.addService(Switch, 'Jet Mode');
    this.serviceSwitch.updateCharacteristic(platform.Characteristic.Name, 'Jet Mode');
    this.serviceSwitch.getCharacteristic(platform.Characteristic.On)
      .onSet((value: CharacteristicValue) => {
        if (this.Status.isPowerOn && this.Status.opMode === 0) {
          this.platform.ThinQ?.deviceControl(device.id, {
            dataKey: 'airState.wMode.jet',
            dataValue: value ? 1 : 0,
          }).then(() => {
            device.data.snapshot['airState.wMode.jet'] = value ? 1 : 0;
            this.updateAccessoryCharacteristic(device);
          });
        }
      });
  }

  public updateAccessoryCharacteristic(device: Device) {
    super.updateAccessoryCharacteristic(device);

    this.serviceSwitch.updateCharacteristic(this.platform.Characteristic.On, !!device.snapshot['airState.wMode.jet']);
  }
}
