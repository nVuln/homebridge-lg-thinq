import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { Helper } from './helper';
import {ThinQ} from './lib/ThinQ';
import {EventEmitter} from 'events';
import {PlatformType} from './lib/constants';
import {ManualProcessNeeded, NotConnectedError} from './errors';
import {Device} from './lib/Device';
import Characteristics from './characteristics';

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class LGThinQHomebridgePlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  public readonly customCharacteristics: ReturnType<typeof Characteristics> = Characteristics(this.api.hap.Characteristic);

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];

  public readonly ThinQ: ThinQ;
  public readonly events: EventEmitter;
  private readonly intervalTime;

  // enable thinq1 support
  private readonly enable_thinq1: boolean = false;

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.events = new EventEmitter();

    this.enable_thinq1 = config.thinq1 as boolean;
    this.config.devices = this.config.devices || [];

    this.intervalTime = (config.refresh_interval || 5) * 1000;
    this.ThinQ = new ThinQ(this, config, log);

    if (!config.country || !config.language || !((config.username && config.password) || config.refresh_token)) {
      this.log.error('Missing required config parameter.');
      return;
    }

    const didFinishLaunching = () => {
      // run the method to discover / register your devices as accessories
      this.ThinQ.isReady().then(() => {
        this.log.info('Successfully connected to the ThinQ API.');
        const discoverDevices = () => {
          this.discoverDevices().then(async () => {
            await this.startMonitor();
          }).catch(err => {
            if (err instanceof NotConnectedError) {
              setTimeout(() => {
                discoverDevices();
              }, 30000);
            } else {
              this.log.error(err.message);
              this.log.debug(err);
            }
          });
        };

        discoverDevices();
      }).catch(err => {
        if (err.message === 'Internal Server Error' || err.code?.indexOf('ECONN') === 0 || err instanceof NotConnectedError) {
          this.log.error('LG ThinQ internal server error, try again later.');
        } else {
          this.log.error('ThinQ API is not ready. please check configuration and try again.');
        }

        this.log.error(err.message);
        this.log.debug(err);
      });
    };

    this.api.on('didFinishLaunching', async () => {
      this.log.debug('Executed didFinishLaunching callback');
      didFinishLaunching();
    });
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from Homebridge cache:', accessory.displayName);

    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.accessories.push(accessory);
  }

  async discoverDevices() {
    const accessoriesToRemoveUUID = this.accessories.map(accessory => accessory.UUID);

    const devices: Device[] = await this.ThinQ.devices();

    if (!devices.length) {
      this.log.warn('No ThinQ devices in your account.');
    }

    for (const device of devices) {
      if (!this.enable_thinq1 && device.platform === PlatformType.ThinQ1) {
        this.log.debug('Thinq1 device is skipped: ', device.toString());
        continue;
      }

      this.log.debug('Device data: ', JSON.stringify(device.data));

      if (this.config.devices.length && !this.config.devices.find(enabled => enabled.id === device.id)) {
        this.log.debug('Device skipped: ', device.id);
        continue;
      }

      this.log.info('['+device.name+'] Setting up device!');
      const setupSuccess = await this.ThinQ.setup(device);

      if (!setupSuccess) {
        this.log.warn('['+device.name+'] Failed to setup device!');
        continue;
      }

      const accessoryType = Helper.make(device);
      if (accessoryType === null) {
        this.log.info('Device not supported: ' + device.toString());
        this.ThinQ.unregister(device).then(() => {
          this.log.debug(device.id, '- unregistered!');
        });
        continue;
      }

      let lgThinQDevice;

      const existingAccessory = this.accessories.find(accessory => accessory.UUID === device.id);
      if (existingAccessory) {
        accessoriesToRemoveUUID.splice(accessoriesToRemoveUUID.indexOf(device.id), 1);

        this.log.info('Restoring existing accessory:', device.toString());
        existingAccessory.context.device = device;
        lgThinQDevice = new accessoryType(this, existingAccessory);
      } else {
        this.log.info('Adding new accessory:', device.toString());

        const category = Helper.category(device);
        // create a new accessory
        const accessory = new this.api.platformAccessory(device.name, device.id, category);
        accessory.context.device = device;

        lgThinQDevice = new accessoryType(this, accessory);

        // link the accessory to your platform
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        this.accessories.push(accessory);
      }

      this.events.on(device.id, lgThinQDevice.update.bind(lgThinQDevice));

      // first time update
      lgThinQDevice.updateAccessoryCharacteristic(device);
    }

    const accessoriesToRemove = this.accessories.filter(accessory => accessoriesToRemoveUUID.includes(accessory.UUID));
    if (accessoriesToRemove.length) {
      accessoriesToRemove.map(accessory => {
        this.log.info('Removing accessory:', accessory.displayName);
        this.accessories.splice(this.accessories.indexOf(accessory), 1);
      });

      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, accessoriesToRemove);
    }
  }

  protected async startMonitor() {
    // thinq2 device
    const thinq2devices = this.accessories.filter(accessory => accessory.context.device.platform === PlatformType.ThinQ2);

    if (thinq2devices.length) {
      setInterval(() => {
        this.ThinQ.devices().then((devices) => {
          devices.filter(device => device.platform === PlatformType.ThinQ2).forEach(device => {
            // only emit if device online
            if (device.snapshot.online) {
              this.events.emit('refresh.'+device.id, device.snapshot);
            }
          });
        });
      }, 600000); // every 10 minute

      const refreshList = {};

      thinq2devices.forEach(accessory => {
        const device: Device = accessory.context.device;
        refreshList[device.id] = setTimeout(() => {
          this.events.once('refresh.'+device.id, (snapshot) => {
            this.events.emit(device.id, snapshot);
            refreshList[device.id].refresh();
          });
        }, 300000);
      });

      this.log.info('Start MQTT listener for thinq2 device');
      await this.ThinQ.registerMQTTListener((data) => {
        if ('data' in data && 'deviceId' in data) {
          this.events.emit(data.deviceId, data.data?.state?.reported);

          if (data.deviceId in refreshList) {
            refreshList[data.deviceId].refresh();
          }
        }
      });
    }

    if (this.accessories.length <= thinq2devices.length) {
      return; // no thinq1 device, stop here
    }

    // polling thinq1 device
    this.log.info('Start polling device data every '+ this.config.refresh_interval +' second.');
    const ThinQ = this.ThinQ;
    const interval = setInterval(async () => {
      try {
        for (const accessory of this.accessories) {
          const device: Device = accessory.context.device;
          if (device.platform === PlatformType.ThinQ1 && this.enable_thinq1) {
            const deviceWithSnapshot = await ThinQ.pollMonitor(device);
            if (deviceWithSnapshot.snapshot.raw !== null) {
              this.events.emit(device.id, deviceWithSnapshot.snapshot);
            }
          }
        }
      } catch (err) {
        if (err instanceof ManualProcessNeeded) {
          this.log.info('Stop polling device data.');
          this.log.warn(err.message);
          clearInterval(interval);
          return; // stop plugin here
        }
      }
    }, this.intervalTime);
  }
}
