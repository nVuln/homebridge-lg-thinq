import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { Helper } from './helper';
import {ThinQ} from './lib/ThinQ';
import {EventEmitter} from 'events';
import {PlatformType} from './lib/constants';

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class LGThinQHomebridgePlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];

  public readonly ThinQ: ThinQ | undefined;
  public readonly events: EventEmitter;
  private readonly intervalTime = 5000; // 5 second

  // enable thinq1 support
  private readonly enable_thinq1: boolean = false;

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.events = new EventEmitter();
    if (!config.country || !config.language || !config.username || !config.password) {
      this.log.error('Missing required config parameter.');
      return;
    }
    this.enable_thinq1 = config.thinq1 as boolean;

    this.ThinQ = new ThinQ(this, config, log);

    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only register new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already. This event can also be used
    // to start discovery of new accessories.
    this.api.on('didFinishLaunching', async () => {
      this.log.debug('Executed didFinishLaunching callback');
      // run the method to discover / register your devices as accessories
      await this.discoverDevices();
    });
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.accessories.push(accessory);
  }

  async discoverDevices() {
    if (typeof this.ThinQ === 'undefined' || !await this.ThinQ.isReady()) {
      this.log.info('ThinQ API is not ready. please check configuration and try again.');
      return;
    }
    const accessoriesToRemoveUUID = this.accessories.map(accessory => accessory.UUID);

    const devices = await this.ThinQ.devices();

    for (const device of devices) {
      if (!this.enable_thinq1 && device.platform === PlatformType.ThinQ1) {
        this.log.debug('Thinq1 device is skipped: ', device.toString());
        continue;
      }

      this.log.debug('Found device: ', device.toString());
      this.log.debug('data: ', JSON.stringify(device.data));

      const existingAccessory = this.accessories.find(accessory => accessory.UUID === device.id);

      await this.ThinQ.startMonitor(device);
      const deviceWithSnapshot = await this.ThinQ.pollMonitor(device);

      const accessoryType = Helper.make(deviceWithSnapshot);
      if (accessoryType === null) {
        this.log.debug('Device not supported: ' + device.toString());
        await this.ThinQ.stopMonitor(device);
        continue;
      }

      let lgThinQDevice;

      if (existingAccessory) {
        accessoriesToRemoveUUID.splice(accessoriesToRemoveUUID.indexOf(device.id), 1);

        this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);
        existingAccessory.context.device = deviceWithSnapshot;
        lgThinQDevice = new accessoryType(this, existingAccessory);
      } else {
        this.log.info('Adding new accessory:', device.name);

        const category = Helper.category(device);
        // create a new accessory
        const accessory = new this.api.platformAccessory(device.name, device.id, category);
        accessory.context.device = deviceWithSnapshot;

        lgThinQDevice = new accessoryType(this, accessory);

        // link the accessory to your platform
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }

      this.events.on(device.id, lgThinQDevice.updateAccessoryCharacteristic.bind(lgThinQDevice));
    }

    const accessoriesToRemove = this.accessories.filter(accessory => accessoriesToRemoveUUID.includes(accessory.UUID));
    if (accessoriesToRemove.length) {
      accessoriesToRemove.map(accessory => {
        this.log.info('Removing accessory:', accessory.displayName);
        this.accessories.splice(this.accessories.indexOf(accessory), 1);
      });

      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, accessoriesToRemove);
    }

    this.startMonitor();
  }

  protected startMonitor() {
    if (!this.ThinQ) {
      return;
    }

    this.log.info('Start polling device data.');
    const ThinQ = this.ThinQ;
    setInterval(() => {
      ThinQ.devices().then(async (devices) => {
        for (let device of devices) {
          if (this.enable_thinq1) {
            device = await ThinQ.pollMonitor(device);
          }
          this.events.emit(device.id, device);
        }
      });
    }, this.intervalTime);
  }
}
