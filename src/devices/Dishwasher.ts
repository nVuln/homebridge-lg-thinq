import {baseDevice} from '../baseDevice';
import {LGThinQHomebridgePlatform} from '../platform';
import {PlatformAccessory} from 'homebridge';
import {Device} from '../lib/Device';
import {WasherDryerStatus} from './WasherDryer';

export default class Dishwasher extends baseDevice {
  public isRunning = false;

  protected serviceDishwasher;
  protected serviceDoorOpened;
  protected serviceEventFinished;

  constructor(
    public readonly platform: LGThinQHomebridgePlatform,
    public readonly accessory: PlatformAccessory,
  ) {
    super(platform, accessory);

    const {
      Service: {
        Valve,
        ContactSensor,
        OccupancySensor,
      },
      Characteristic,
    } = this.platform;

    const device = accessory.context.device;

    this.serviceDishwasher = accessory.getService(Valve) || accessory.addService(Valve, 'Dishwasher');
    this.serviceDishwasher.setCharacteristic(Characteristic.Name, device.name);
    this.serviceDishwasher.setCharacteristic(Characteristic.ValveType, Characteristic.ValveType.WATER_FAUCET);
    this.serviceDishwasher.getCharacteristic(Characteristic.Active)
      .onSet(this.setActive.bind(this))
      .updateValue(Characteristic.Active.INACTIVE);
    this.serviceDishwasher.setCharacteristic(Characteristic.InUse, Characteristic.InUse.NOT_IN_USE);
    this.serviceDishwasher.getCharacteristic(Characteristic.RemainingDuration).setProps({
      maxValue: 86400, // 1 day
    });

    // Door open state
    this.serviceDoorOpened = accessory.getService(ContactSensor) || accessory.addService(ContactSensor, 'Dishwasher Door');

    this.serviceEventFinished = accessory.getService(OccupancySensor);
    if (this.config.dishwasher_trigger as boolean) {
      this.serviceEventFinished = this.serviceEventFinished || accessory.addService(OccupancySensor, device.name + ' - Program Finished');
      // eslint-disable-next-line max-len
      this.serviceEventFinished.updateCharacteristic(Characteristic.OccupancyDetected, Characteristic.OccupancyDetected.OCCUPANCY_NOT_DETECTED);
    } else if (this.serviceEventFinished) {
      accessory.removeService(this.serviceEventFinished);
    }
  }

  public setActive() {
    throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.NOT_ALLOWED_IN_CURRENT_STATE);
  }

  public updateAccessoryCharacteristic(device: Device) {
    super.updateAccessoryCharacteristic(device);

    const {Characteristic} = this.platform;

    const prevRemainDuration = this.serviceDishwasher.getCharacteristic(Characteristic.RemainingDuration).value;
    if (this.Status.remainDuration !== prevRemainDuration) {
      this.serviceDishwasher.updateCharacteristic(Characteristic.RemainingDuration, this.Status.remainDuration);
    }
    this.serviceDishwasher.updateCharacteristic(Characteristic.Active, this.Status.isPowerOn ? 1 : 0);
    this.serviceDishwasher.updateCharacteristic(Characteristic.InUse, this.Status.isRunning ? 1 : 0);

    if (this.serviceDoorOpened) {
      const contactSensorValue = this.Status.isDoorClosed ?
        Characteristic.ContactSensorState.CONTACT_DETECTED : Characteristic.ContactSensorState.CONTACT_NOT_DETECTED;
      this.serviceDoorOpened.updateCharacteristic(Characteristic.ContactSensorState, contactSensorValue);
    }
  }

  public get Status() {
    return new DishwasherStatus(this.accessory.context.device.snapshot?.dishwasher, this.accessory.context.device.deviceModel);
  }

  public get config() {
    return Object.assign({}, {
      dishwasher_trigger: false,
    }, super.config);
  }

  public update(snapshot) {
    super.update(snapshot);

    const dishwasher = snapshot.dishwasher;
    if (!dishwasher) {
      return;
    }

    // when washer state is changed
    if (this.config.dishwasher_trigger as boolean && this.serviceEventFinished && 'state' in dishwasher) {
      const {
        Characteristic: {
          OccupancyDetected,
        },
      } = this.platform;

      // detect if washer program in done
      if ((['END'].includes(dishwasher.state)) || (this.isRunning && !this.Status.isRunning)) {
        this.serviceEventFinished.updateCharacteristic(OccupancyDetected, OccupancyDetected.OCCUPANCY_DETECTED);
        this.isRunning = false; // marked device as not running

        // turn it off after 10 minute
        setTimeout(() => {
          this.serviceEventFinished.updateCharacteristic(OccupancyDetected, OccupancyDetected.OCCUPANCY_NOT_DETECTED);
        }, 10000 * 60);
      }

      // detect if dishwasher program is start
      if (this.Status.isRunning && !this.isRunning) {
        this.serviceEventFinished.updateCharacteristic(OccupancyDetected, OccupancyDetected.OCCUPANCY_NOT_DETECTED);
        this.isRunning = true;
      }
    }
  }
}

// re-use some status in washer
export class DishwasherStatus extends WasherDryerStatus {
  public get isRunning() {
    return this.isPowerOn && this.data?.state === this.deviceModel.lookupMonitorName('state', '@DW_STATE_RUNNING_W');
  }

  public get isDoorClosed() {
    return this.data?.door === this.deviceModel.lookupMonitorName('door', '@CP_OFF_EN_W');
  }
}
