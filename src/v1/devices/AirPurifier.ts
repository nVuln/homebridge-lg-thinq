import {default as V2, RotateSpeed} from '../../devices/AirPurifier';
import {CharacteristicValue, PlatformAccessory} from 'homebridge';
import {Device} from '../../lib/Device';
import {LGThinQHomebridgePlatform} from '../../platform';

export default class AirPurifier extends V2 {
  constructor(
    protected readonly platform: LGThinQHomebridgePlatform,
    protected readonly accessory: PlatformAccessory,
  ) {
    super(platform, accessory);

    this.turboModeSetup(accessory.context.device);
  }

  async setActive(value: CharacteristicValue) {
    const device: Device = this.accessory.context.device;
    await this.platform.ThinQ?.thinq1DeviceControl(device, 'Operation', value as boolean ? '1' : '0');
  }

  async setTargetAirPurifierState(value: CharacteristicValue) {
    const device: Device = this.accessory.context.device;
    if (!this.Status.isPowerOn || (!!value !== this.Status.isNormalMode)) {
      return; // just skip it
    }

    await this.platform.ThinQ?.thinq1DeviceControl(device, 'OpMode', value as boolean ? '16' : '14');
  }

  async setRotationSpeed(value: CharacteristicValue) {
    if (!this.Status.isPowerOn || !this.Status.isNormalMode) {
      return;
    }

    const device: Device = this.accessory.context.device;
    const values = Object.keys(RotateSpeed);
    const windStrength = parseInt(values[Math.round((value as number)) - 1]) || RotateSpeed.EXTRA;
    await this.platform.ThinQ?.thinq1DeviceControl(device, 'WindStrength', windStrength.toString());
  }

  async setSwingMode(value: CharacteristicValue) {
    if (!this.Status.isPowerOn || !this.Status.isNormalMode) {
      return;
    }

    const device: Device = this.accessory.context.device;
    await this.platform.ThinQ?.thinq1DeviceControl(device, 'CirculateDir', value as boolean ? '1' : '0');
  }

  async setLight(value: CharacteristicValue) {
    if (!this.Status.isPowerOn) {
      return;
    }

    const device: Device = this.accessory.context.device;
    await this.platform.ThinQ?.thinq1DeviceControl(device, 'SignalLighting', value as boolean ? '1' : '0');
  }

  public turboModeSetup(device: Device) {
    // model supported only
    if (['AIR_910604_WW'].includes(device.model)) {
      const {
        Service: {
          Switch,
        },
      } = this.platform;

      const serviceTurboMode = this.accessory.getService(Switch) || this.accessory.addService(Switch, 'Turbo Mode');
      serviceTurboMode.updateCharacteristic(this.platform.Characteristic.Name, 'Turbo Mode');
      serviceTurboMode.getCharacteristic(this.platform.Characteristic.On)
        .onGet(() => {
          return this.accessory.context.device.snapshot.raw['AirFast'];
        })
        .onSet((value: CharacteristicValue) => {
          if (this.Status.isPowerOn) {
            this.platform.ThinQ.thinq1DeviceControl(device, 'AirFast', value ? '1' : '0').then(() => {
              device.data.snapshot.raw['AirFast'] = value ? 1 : 0;
              this.updateAccessoryCharacteristic(device);
            });
          }
        });
    }
  }
}
