import { API, DynamicPlatformPlugin, PlatformAccessory, PlatformConfig, Service, Characteristic, Logging } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';
import { Helper } from './helper.js';
import { ThinQ } from './lib/ThinQ.js';
import { EventEmitter } from 'events';
import { PlatformType } from './lib/constants.js';
import { ManualProcessNeeded, NotConnectedError } from './errors/index.js';
import { Device } from './lib/Device.js';
import Characteristics from './characteristics/index.js';
import { AccessoryContext, BaseDevice } from './baseDevice.js';

/**
 * LGThinQHomebridgePlatform
 * This class serves as the main entry point for the Homebridge plugin. It handles
 * configuration parsing, device discovery, and accessory registration.
 */
export class LGThinQHomebridgePlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;

  public readonly customCharacteristics: ReturnType<typeof Characteristics>;

  // Tracks restored cached accessories
  public readonly accessories: PlatformAccessory<AccessoryContext>[] = [];

  public readonly ThinQ: ThinQ;
  public readonly events: EventEmitter;
  private readonly intervalTime: number;

  // Enable ThinQ1 support
  private readonly enable_thinq1: boolean = false;

  // This is only required when using Custom Services and Characteristics not support by HomeKit
  public readonly CustomServices: any;
  public readonly CustomCharacteristics: any;

  constructor(
    public readonly log: Logging,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.Service = this.api.hap.Service;
    this.Characteristic = this.api.hap.Characteristic;
    this.customCharacteristics = Characteristics(this.api.hap.Characteristic);
    this.events = new EventEmitter();

    this.enable_thinq1 = config.thinq1 as boolean;
    this.config.devices = this.config.devices || [];

    // Set the refresh interval for polling device data
    this.intervalTime = (config.refresh_interval || 5) * 1000;
    this.ThinQ = new ThinQ(this, config, log);

    // Validate required configuration parameters
    if (!config.country || !config.language || !((config.username && config.password) || config.refresh_token)) {
      this.log.error('Missing required config parameter.');
      return;
    }

    const didFinishLaunching = () => {
      // Discover and register devices after the platform is ready
      this.ThinQ.isReady().then(() => {
        this.log.info('Successfully connected to the ThinQ API.');
        const discoverDevices = () => {
          this.discoverDevices().then(async () => {
            await this.startMonitor();
          }).catch(err => {
            if (err instanceof NotConnectedError) {
              // Retry device discovery after 30 seconds if not connected
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
          this.log.error('ThinQ API is not ready. Please check configuration and try again.');
        }

        this.log.error(err.message);
        this.log.debug(err);
      });
    };

    this.api.on('didFinishLaunching', async () => {
      log.debug('Executed didFinishLaunching callback');
      didFinishLaunching();
    });
  }

  /**
   * Invoked when Homebridge restores cached accessories from disk at startup.
   * This method sets up event handlers for characteristics and updates respective values.
   *
   * @param accessory - The cached accessory to configure.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from Homebridge cache:', accessory.displayName);

    if (!accessory.context.device) {
      this.log.error('Accessory does not have a device context. Cannot restore accessory:', accessory.displayName);
      return;
    }

    // Add the restored accessory to the accessories cache
    this.accessories.push(accessory as PlatformAccessory<AccessoryContext>);
  }

  /**
   * Discovers devices from the ThinQ API and registers them as Homebridge accessories.
   */
  async discoverDevices() {
    const accessoriesToRemoveUUID = this.accessories.map(accessory => accessory.UUID);

    const devices: Device[] = await this.ThinQ.devices();

    if (!devices.length) {
      this.log.warn('No ThinQ devices in your account.');
    }

    for (const device of devices) {
      this.log.debug('Device [' + device.name + ']: ', device.toString());
      this.log.debug(JSON.stringify(device.data));

      // Skip ThinQ1 devices if support is disabled
      if (!this.enable_thinq1 && device.platform === PlatformType.ThinQ1) {
        this.log.debug('Thinq1 device is skipped: ', device.toString());
        continue;
      }

      // Skip devices not explicitly enabled in the configuration
      if (this.config.devices.length && !this.config.devices.find((enabled: any) => enabled.id === device.id)) {
        this.log.info('Device skipped: ', device.id);
        continue;
      }

      this.log.info('[' + device.name + '] Setting up device!');
      const setupSuccess = await this.ThinQ.setup(device);

      if (!setupSuccess) {
        this.log.warn('[' + device.name + '] Failed to setup device!');
        continue;
      }

      const accessoryType = Helper.make(device);
      if (accessoryType === null) {
        this.log.info('Device not supported: ' + device.platform + ': ' + device.toString());
        this.ThinQ.unregister(device).then(() => {
          this.log.debug(device.id, '- unregistered!');
        });
        continue;
      }

      let lgThinQDevice: BaseDevice;

      const existingAccessory: PlatformAccessory<AccessoryContext> | undefined = this.accessories.find(accessory => accessory.UUID === device.id);
      if (existingAccessory) {
        // Remove the UUID from the removal list if the accessory already exists
        accessoriesToRemoveUUID.splice(accessoriesToRemoveUUID.indexOf(device.id), 1);

        this.log.info('Restoring existing accessory:', device.toString());
        existingAccessory.context.device = device;
        lgThinQDevice = new accessoryType(this, existingAccessory, this.log);
      } else {
        this.log.info('Adding new accessory:', device.toString());

        const category = Helper.category(device);
        // Create a new accessory
        const accessory: PlatformAccessory<AccessoryContext> | undefined = new this.api.platformAccessory(device.name, device.id, category);
        accessory.context.device = device;

        lgThinQDevice = new accessoryType(this, accessory, this.log);

        // Register the accessory with Homebridge
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);

        this.accessories.push(accessory);
      }

      // Bind the update event for the device
      this.events.on(device.id, lgThinQDevice.update.bind(lgThinQDevice));

      // Perform the first-time update
      lgThinQDevice.updateAccessoryCharacteristic(device);
    }

    // Remove accessories that are no longer present in the ThinQ API
    const accessoriesToRemove = this.accessories.filter(accessory => accessoriesToRemoveUUID.includes(accessory.UUID));
    if (accessoriesToRemove.length) {
      accessoriesToRemove.map(accessory => {
        this.log.info('Removing accessory:', accessory.displayName);
        this.accessories.splice(this.accessories.indexOf(accessory), 1);
      });

      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, accessoriesToRemove);
    }
  }

  /**
   * Starts monitoring devices for updates using MQTT or polling.
   */
  protected async startMonitor() {
    // Filter ThinQ2 devices
    const thinq2devices = this.accessories.filter(accessory => accessory.context.device.platform === PlatformType.ThinQ2);

    if (thinq2devices.length) {
      // Start polling ThinQ2 devices at the configured interval
      setInterval(() => {
        this.ThinQ.devices().then((devices) => {
          devices.filter(device => device.platform === PlatformType.ThinQ2).forEach(device => {
            this.events.emit(device.id, device.snapshot);
          });
        });
      }, this.intervalTime);

      this.log.info('Start MQTT listener for ThinQ2 devices');
      await this.ThinQ.registerMQTTListener((data) => {
        if ('data' in data && 'deviceId' in data) {
          this.events.emit(data.deviceId, data.data?.state?.reported);
        }
      });
    }

    // Stop here if there are no ThinQ1 devices
    if (this.accessories.length <= thinq2devices.length) {
      return;
    }

    // Start polling ThinQ1 devices
    this.log.info('Start polling device data every ' + this.config.refresh_interval + ' seconds.');
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
          return; // Stop the plugin here
        }
      }
    }, this.intervalTime);
  }
}
