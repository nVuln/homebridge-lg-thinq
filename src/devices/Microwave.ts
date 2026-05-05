/**
 * Special thank to carlosgamezvillegas (https://github.com/carlosgamezvillegas) for the initial work on the Microwave device.
 */
import { AccessoryContext, BaseDevice } from '../baseDevice.js';
import { Device } from '../lib/Device.js';
import { DeviceModel } from '../lib/DeviceModel.js';
import { LGThinQHomebridgePlatform } from '../platform.js';
import { Logger, PlatformAccessory, Service } from 'homebridge';
import { normalizeBoolean, normalizeNumber } from '../utils/normalize.js';
import {
  cookingAlarmServiceUpdate,
  cookingStopCommand,
  cookingTimerServiceUpdate,
  durationFromSnapshot,
  hasActiveCookingState,
  hasCookingModeActive,
  hasNonZeroSnapshotNumber,
  homeKitTemperatureFromSnapshot,
  isFahrenheitUnit,
  isInitialCookingState,
  microwaveRemoteStartCommand,
  microwaveTimerCommand,
  microwaveVentLampCommand,
  microwavePowerPercent,
  prepareMicrowaveCookCommand,
  temperatureDisplayUnitsValue,
} from './cooking.js';
import {
  snapshotNumber,
  snapshotString,
  updateCharacteristicIfChanged,
  visibilityCharacteristicUpdate,
} from './helpers.js';

export default class Microwave extends BaseDevice {
  protected inputNameStatus = 'Microwave Status';
  protected inputNameMode = 'Microwave Mode';
  protected inputNameTempString = 'Microwave Temperature';
  protected courseStartString = 'Microwave Start Time Not Set';
  protected courseTimeString = 'Microwave Cook Time Not Set';
  protected courseTimerString = 'Microwave Cook Timer Not Set';
  protected courseTimeEndString = 'Microwave End Time Not Set';
  protected inputNameOptions = 'Microwave Options';
  protected firstStart = true;
  protected firstDuration = 0;
  protected firstTimer = 0;
  protected courseStartMS = 0;
  protected inputID = 1;
  protected temperatureFCommand = 0;
  protected thermostatSel = 0;
  protected timerAlarmSec = 0;
  protected pauseUpdate = false;
  protected firstPause = true;
  protected ventSpeed = 0;
  protected lampLevel = 0;
  protected mwPower = 50;
  protected localTemperature = 22;
  protected localHumidity = 50;
  protected defaultTemp = 0;
  protected waitingForCommand = false;
  protected ovenCommandList = {
    ovenMode: 'WARM',
    ovenSetTemperature: 0,
    tempUnits: 'FAHRENHEIT',
    ovenSetDuration: 0,
    subCookNumber: 0,
    weightUnits: 'KG',
    microwavePower: '100',
    targetWeight: 0 };
  protected showTime = true;
  protected showTimer = true;
  protected monitorOnly = false;
  protected timeOut = 0;

  /** Service */
  private serviceHood: Service;
  private serviceLight: Service;
  private microwavePower: Service;
  private ovenService: Service;
  private ovenState: Service;
  private lightVent: Service;
  private ovenMode: Service;
  private ovenTemp: Service;
  private ovenOptions: Service;
  private ovenStart: Service;
  private ovenTimer: Service;
  private ovenTime: Service;
  private ovenEndTime: Service;
  private ovenTimerService: Service;
  private ovenAlarmService: Service;
  private microwaveSwitch: Service;
  private combiBakeSwitch: Service;
  private dehydrateSwitch: Service;
  private ovenSwitch: Service;
  private convectionBakeSwitch: Service;
  private convectionRoastSwitch: Service;
  private frozenMealSwitch: Service;
  private defrostSwitch: Service;
  private airFrySwitch: Service;
  private proofSwitch: Service;
  private warmModeSwitch: Service;
  private cancelSwitch: Service;
  private startOvenSwitch: Service;
  private ovenTempControl: Service;
  private offSwitch: Service;

  constructor(
    public readonly platform: LGThinQHomebridgePlatform,
    public readonly accessory: PlatformAccessory<AccessoryContext>,
    logger: Logger,
  ) {
    super(platform, accessory, logger);
    const { Characteristic } = this.platform;
    //const device = accessory.context.device;

    this.serviceHood = this.accessory.getService('Microwave Fan') ||
      this.accessory.addService(this.platform.Service.Fanv2, 'Microwave Fan', 'YourUniqueIdentifier-59F');
    this.serviceHood.addOptionalCharacteristic(this.platform.Characteristic.ConfiguredName);
    this.serviceHood.setCharacteristic(this.platform.Characteristic.ConfiguredName, 'Microwave Fan');
    this.serviceHood.getCharacteristic(Characteristic.Active)
      .onGet(this.onlineGet(() => hasNonZeroSnapshotNumber(this.Status.data, 'mwoVentSpeedLevel') ? 1 : 0))
      .onSet((value) => {
        this.ventSpeed = value as number;
        if (this.ventSpeed !== snapshotNumber(this.Status.data, 'mwoVentSpeedLevel')) {
          this.sendLightVentCommand();
        }
      });
    this.serviceHood.getCharacteristic(Characteristic.RotationSpeed).onGet(this.onlineGet(() => {
      this.ventSpeed = snapshotNumber(this.Status.data, 'mwoVentSpeedLevel');
      return this.ventSpeed;
    })).onSet((value) => {
      this.ventSpeed = value as number;
      this.sendLightVentCommand();
    });
    this.serviceHood.getCharacteristic(Characteristic.RotationSpeed)
      .setProps({
        minValue: 0,
        maxValue: 5,
        minStep: 1,
      });
    // vent lamp
    this.serviceLight = this.accessory.getService('Microwave Light') ||
      this.accessory.addService(this.platform.Service.Lightbulb, 'Microwave Light', 'YourUniqueIdentifier-59L');
    this.serviceLight.addOptionalCharacteristic(this.platform.Characteristic.ConfiguredName);
    this.serviceLight.setCharacteristic(this.platform.Characteristic.ConfiguredName, 'Microwave Light');
    this.serviceLight.getCharacteristic(Characteristic.On).onSet((value) => {
      const enabled = normalizeBoolean(value);
      if (!enabled) {
        this.lampLevel = 0;
        this.sendLightVentCommand();
      } else {
        this.lampLevel = 2;
        this.sendLightVentCommand();
      }
    }).onGet(this.onlineGet(() => hasNonZeroSnapshotNumber(this.Status.data, 'mwoLampLevel')));
    this.serviceLight.getCharacteristic(Characteristic.Brightness).onGet(this.onlineGet(() => {
      this.lampLevel = snapshotNumber(this.Status.data, 'mwoLampLevel');
      return this.lampLevel;
    })).onSet((value) => {
      this.lampLevel = value as number;
      if (this.lampLevel !== snapshotNumber(this.Status.data, 'mwoLampLevel')) {
        this.sendLightVentCommand();
      }
    });
    this.serviceLight.getCharacteristic(Characteristic.Brightness)
      .setProps({
        minValue: 0,
        maxValue: 2,
        minStep: 1,
      });

    this.offSwitch = accessory.getService('Turn Off Microwave') ||
      accessory.addService(this.platform.Service.Switch, 'Turn Off Microwave', 'CataNicoGaTa-Control8Off');
    this.offSwitch.addOptionalCharacteristic(this.platform.Characteristic.ConfiguredName);
    this.offSwitch.setCharacteristic(this.platform.Characteristic.ConfiguredName, 'Turn Off the Microwave');
    this.offSwitch.getCharacteristic(this.platform.Characteristic.On).onGet(() => {
      const currentValue = false;
      return currentValue;
    }).onSet((value) => {
      if (value as boolean) {
        if (hasNonZeroSnapshotNumber(this.Status.data, 'mwoVentSpeedLevel')
            || hasNonZeroSnapshotNumber(this.Status.data, 'mwoLampLevel')) {
          this.lampLevel = 0;
          this.ventSpeed = 0;
          this.sendLightVentCommand();
        }

        setTimeout(() => {
          this.offSwitch.updateCharacteristic(this.platform.Characteristic.On, false);
        }, 1000);
      }
    });

    this.microwavePower = this.accessory.getService('Microwave Power') ||
      this.accessory.addService(this.platform.Service.Lightbulb, 'Microwave Power', 'YourUniqueIdentifier-59SP');
    this.microwavePower.addOptionalCharacteristic(this.platform.Characteristic.ConfiguredName);
    this.microwavePower.setCharacteristic(this.platform.Characteristic.ConfiguredName, 'Microwave Power');
    this.microwavePower.getCharacteristic(this.platform.Characteristic.On).onSet((value) => {
      const enabled = normalizeBoolean(value);
      if (!enabled) {
        this.mwPower = 0;
      } else {
        this.mwPower = 100;
      }
    }).onGet(this.onlineGet(() => microwavePowerPercent(this.Status.data) > 0));

    this.microwavePower.getCharacteristic(this.platform.Characteristic.Brightness)
      .onGet(this.onlineGet(() => microwavePowerPercent(this.Status.data)))
      .onSet((value) => {
        this.mwPower = value as number;
      });
    this.microwavePower.getCharacteristic(this.platform.Characteristic.Brightness)
      .setProps({
        minValue: 0,
        maxValue: 100,
        minStep: 10,
      });

    /////////////
    this.ovenService = this.accessory.getService(this.config.name) ||
      this.accessory.addService(this.platform.Service.Television, this.config.name, 'NicoCataGaTa-OvenOven7');
    this.ovenService.setCharacteristic(this.platform.Characteristic.ConfiguredName, 'LG Microwave Oven');
    this.ovenService.setPrimaryService(true);
    this.ovenService.setCharacteristic(this.platform
      .Characteristic.SleepDiscoveryMode, this.platform.Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);
    this.ovenService.getCharacteristic(this.platform.Characteristic.Active).onGet(this.onlineGet(() => this.ovenServiceActive())).onSet((value) => {
      const enabled = normalizeBoolean(value);
      if (!enabled) {
        if (isInitialCookingState(this.Status.data, 'LWOState')) {
          this.stopOven();
          this.timeOut = 1500;
          setTimeout(() => {
            this.timeOut = 0;
          }, this.timeOut);
        }
        setTimeout(() => {
          if (hasNonZeroSnapshotNumber(this.Status.data, 'mwoVentSpeedLevel')
              || hasNonZeroSnapshotNumber(this.Status.data, 'mwoLampLevel')) {
            this.lampLevel = 0;
            this.ventSpeed = 0;
            this.sendLightVentCommand();
          }
        }, this.timeOut);
      } else {
        if (snapshotNumber(this.Status.data, 'mwoVentSpeedLevel') === 0 || snapshotNumber(this.Status.data, 'mwoLampLevel') === 0) {
          this.lampLevel = 2;
          this.ventSpeed = 2;
          this.sendLightVentCommand();
        }
      }
    });
    this.ovenService
      .setCharacteristic(this.platform.Characteristic.ActiveIdentifier, this.inputID);
    this.ovenService
      .getCharacteristic(this.platform.Characteristic.ActiveIdentifier).onSet((inputIdentifier) => {
        const vNum = normalizeNumber(inputIdentifier);
        if (vNum === null) {
          this.platform.log.error('ActiveIdentifier is not a number');
          return;
        }
        if (vNum > 9 || vNum < 1) {
          this.inputID = 1;
        } else {
          this.inputID = vNum;
        }
      }).onGet(() => {
        const currentValue = this.inputID;
        return currentValue;
      });
    this.ovenState = this.accessory.getService('Microwave Status')
      || this.accessory.addService(
        this.platform.Service.InputSource,
        'Microwave Status',
        'NicoCataGaTa-Oven1003',
      )
        .setCharacteristic(this.platform.Characteristic.Identifier, 1)
        .setCharacteristic(
          this.platform.Characteristic.ConfiguredName,
          this.ovenStatus(),
        )
        .setCharacteristic(
          this.platform.Characteristic.IsConfigured,
          this.platform.Characteristic.IsConfigured.CONFIGURED,
        )
        .setCharacteristic(
          this.platform.Characteristic.InputSourceType,
          this.platform.Characteristic.InputSourceType.APPLICATION,
        )
        .setCharacteristic(
          this.platform.Characteristic.CurrentVisibilityState,
          this.platform.Characteristic.CurrentVisibilityState.SHOWN,
        );
    this.ovenState.getCharacteristic(this.platform.Characteristic.ConfiguredName).onGet(() => {
      const currentValue = this.ovenStatus();
      return currentValue;
    });
    this.ovenService.addLinkedService(this.ovenState);
    this.lightVent = this.accessory.getService('Light and Vent Status')
      || this.accessory.addService(
        this.platform.Service.InputSource,
        'Light and Vent Status',
        'NicoCata-Always15',
      )
        .setCharacteristic(this.platform.Characteristic.Identifier, 2)
        .setCharacteristic(
          this.platform.Characteristic.ConfiguredName,
          this.lightVentStatus(),
        )
        .setCharacteristic(
          this.platform.Characteristic.IsConfigured,
          this.platform.Characteristic.IsConfigured.CONFIGURED,
        )
        .setCharacteristic(
          this.platform.Characteristic.InputSourceType,
          this.platform.Characteristic.InputSourceType.APPLICATION,
        )
        .setCharacteristic(
          this.platform.Characteristic.TargetVisibilityState,
          this.lightVentState()
            ? this.platform.Characteristic.TargetVisibilityState.SHOWN
            : this.platform.Characteristic.TargetVisibilityState.HIDDEN,
        )
        .setCharacteristic(
          this.platform.Characteristic.CurrentVisibilityState,
          this.lightVentState()
            ? this.platform.Characteristic.CurrentVisibilityState.SHOWN
            : this.platform.Characteristic.CurrentVisibilityState.HIDDEN,
        );
    this.lightVent.getCharacteristic(this.platform.Characteristic.ConfiguredName).onGet(() => {
      const currentValue = this.lightVentStatus();
      return currentValue;
    });
    this.ovenService.addLinkedService(this.lightVent);
    this.ovenMode = this.accessory.getService('Microwave Cooking Mode')
      || this.accessory.addService(
        this.platform.Service.InputSource,
        'Microwave Cooking Mode',
        'NicoCataGaTa-Oven1004',
      )
        .setCharacteristic(this.platform.Characteristic.Identifier, 3)
        .setCharacteristic(
          this.platform.Characteristic.ConfiguredName,
          this.ovenModeName(),
        )
        .setCharacteristic(
          this.platform.Characteristic.IsConfigured,
          this.platform.Characteristic.IsConfigured.CONFIGURED,
        )
        .setCharacteristic(
          this.platform.Characteristic.InputSourceType,
          this.platform.Characteristic.InputSourceType.APPLICATION,
        )
        .setCharacteristic(
          this.platform.Characteristic.TargetVisibilityState,
          this.onStatus()
            ? this.platform.Characteristic.TargetVisibilityState.SHOWN
            : this.platform.Characteristic.TargetVisibilityState.HIDDEN,
        )
        .setCharacteristic(
          this.platform.Characteristic.CurrentVisibilityState,
          this.onStatus()
            ? this.platform.Characteristic.CurrentVisibilityState.SHOWN
            : this.platform.Characteristic.CurrentVisibilityState.HIDDEN,
        );
    this.ovenMode.getCharacteristic(this.platform.Characteristic.ConfiguredName).onGet(() => {
      const currentValue = this.ovenModeName();
      return currentValue;
    });
    this.ovenService.addLinkedService(this.ovenMode);

    this.ovenTemp = this.accessory.getService('Microwave Oven Temperature')
      || this.accessory.addService(
        this.platform.Service.InputSource,
        'Microwave Oven Temperature',
        'NicoCataGaTa-Oven1004T',
      )
        .setCharacteristic(this.platform.Characteristic.Identifier, 4)
        .setCharacteristic(
          this.platform.Characteristic.ConfiguredName,
          this.ovenTemperature(),
        )
        .setCharacteristic(
          this.platform.Characteristic.IsConfigured,
          this.platform.Characteristic.IsConfigured.CONFIGURED,
        )
        .setCharacteristic(
          this.platform.Characteristic.InputSourceType,
          this.platform.Characteristic.InputSourceType.APPLICATION,
        )
        .setCharacteristic(
          this.platform.Characteristic.TargetVisibilityState,
          this.onStatus()
            ? this.platform.Characteristic.TargetVisibilityState.SHOWN
            : this.platform.Characteristic.TargetVisibilityState.HIDDEN,
        )
        .setCharacteristic(
          this.platform.Characteristic.CurrentVisibilityState,
          this.onStatus()
            ? this.platform.Characteristic.CurrentVisibilityState.SHOWN
            : this.platform.Characteristic.CurrentVisibilityState.HIDDEN,
        );
    this.ovenTemp.getCharacteristic(this.platform.Characteristic.ConfiguredName).onGet(() => {
      const currentValue = this.ovenTemperature();
      return currentValue;
    });
    this.ovenService.addLinkedService(this.ovenTemp);
    this.ovenOptions = this.accessory.getService('Microwave Options')
      || this.accessory.addService(
        this.platform.Service.InputSource,
        'Microwave Options',
        'NicoCata-Always4',
      )
        .setCharacteristic(this.platform.Characteristic.Identifier, 5)
        .setCharacteristic(
          this.platform.Characteristic.ConfiguredName,
          this.oventOptions(),
        )
        .setCharacteristic(
          this.platform.Characteristic.IsConfigured,
          this.platform.Characteristic.IsConfigured.CONFIGURED,
        )
        .setCharacteristic(
          this.platform.Characteristic.InputSourceType,
          this.platform.Characteristic.InputSourceType.APPLICATION,
        )
        .setCharacteristic(
          this.platform.Characteristic.TargetVisibilityState,
          this.onStatus()
            ? this.platform.Characteristic.TargetVisibilityState.SHOWN
            : this.platform.Characteristic.TargetVisibilityState.HIDDEN,
        )
        .setCharacteristic(
          this.platform.Characteristic.CurrentVisibilityState,
          this.onStatus()
            ? this.platform.Characteristic.CurrentVisibilityState.SHOWN
            : this.platform.Characteristic.CurrentVisibilityState.HIDDEN,
        );
    this.ovenOptions.getCharacteristic(this.platform.Characteristic.ConfiguredName).onGet(() => {
      const currentValue = this.oventOptions();
      return currentValue;
    });
    this.ovenService.addLinkedService(this.ovenOptions);
    this.ovenStart = this.accessory.getService('Microwave Start Time')
      || this.accessory.addService(
        this.platform.Service.InputSource,
        'Microwave Start Time',
        'NicoCata-Always1',
      )
        .setCharacteristic(this.platform.Characteristic.Identifier, 6)
        .setCharacteristic(
          this.platform.Characteristic.ConfiguredName,
          this.courseStartString,
        )
        .setCharacteristic(
          this.platform.Characteristic.IsConfigured,
          this.platform.Characteristic.IsConfigured.CONFIGURED,
        )
        .setCharacteristic(
          this.platform.Characteristic.InputSourceType,
          this.platform.Characteristic.InputSourceType.APPLICATION,
        )
        .setCharacteristic(
          this.platform.Characteristic.TargetVisibilityState,
          this.showTime
            ? this.platform.Characteristic.TargetVisibilityState.SHOWN
            : this.platform.Characteristic.TargetVisibilityState.HIDDEN,
        )
        .setCharacteristic(
          this.platform.Characteristic.CurrentVisibilityState,
          this.showTime
            ? this.platform.Characteristic.CurrentVisibilityState.SHOWN
            : this.platform.Characteristic.CurrentVisibilityState.HIDDEN,
        );
    this.ovenStart.getCharacteristic(this.platform.Characteristic.ConfiguredName).onGet(() => {
      const currentValue = this.courseStartString;
      return currentValue;
    });
    this.ovenService.addLinkedService(this.ovenStart);

    this.ovenTimer = this.accessory.getService('Microwave Timer Status')
      || this.accessory.addService(
        this.platform.Service.InputSource,
        'Microwave Timer Status',
        'NicoCata-Always2',
      )
        .setCharacteristic(this.platform.Characteristic.Identifier, 7)
        .setCharacteristic(
          this.platform.Characteristic.ConfiguredName,
          this.courseTimerString,
        )
        .setCharacteristic(
          this.platform.Characteristic.IsConfigured,
          this.platform.Characteristic.IsConfigured.CONFIGURED,
        )
        .setCharacteristic(
          this.platform.Characteristic.InputSourceType,
          this.platform.Characteristic.InputSourceType.APPLICATION,
        )
        .setCharacteristic(
          this.platform.Characteristic.TargetVisibilityState,
          this.showTimer
            ? this.platform.Characteristic.TargetVisibilityState.SHOWN
            : this.platform.Characteristic.TargetVisibilityState.HIDDEN,
        )
        .setCharacteristic(
          this.platform.Characteristic.CurrentVisibilityState,
          this.showTimer
            ? this.platform.Characteristic.CurrentVisibilityState.SHOWN
            : this.platform.Characteristic.CurrentVisibilityState.HIDDEN,
        );
    this.ovenTimer.getCharacteristic(this.platform.Characteristic.ConfiguredName).onGet(() => {
      const currentValue = this.courseTimerString;
      return currentValue;
    });
    this.ovenService.addLinkedService(this.ovenTimer);

    this.ovenTime = this.accessory.getService('Microwave Cook Time Status')
      || this.accessory.addService(
        this.platform.Service.InputSource,
        'Microwave Cook Time Status',
        'NicoCata-Always2T',
      )
        .setCharacteristic(this.platform.Characteristic.Identifier, 8)
        .setCharacteristic(
          this.platform.Characteristic.ConfiguredName,
          this.courseTimeString,
        )
        .setCharacteristic(
          this.platform.Characteristic.IsConfigured,
          this.platform.Characteristic.IsConfigured.CONFIGURED,
        )
        .setCharacteristic(
          this.platform.Characteristic.InputSourceType,
          this.platform.Characteristic.InputSourceType.APPLICATION,
        )
        .setCharacteristic(
          this.platform.Characteristic.TargetVisibilityState,
          this.showTime
            ? this.platform.Characteristic.TargetVisibilityState.SHOWN
            : this.platform.Characteristic.TargetVisibilityState.HIDDEN,
        )
        .setCharacteristic(
          this.platform.Characteristic.CurrentVisibilityState,
          this.showTime
            ? this.platform.Characteristic.CurrentVisibilityState.SHOWN
            : this.platform.Characteristic.CurrentVisibilityState.HIDDEN,
        );
    this.ovenTime.getCharacteristic(this.platform.Characteristic.ConfiguredName).onGet(() => {
      const currentValue = this.courseTimeString;
      return currentValue;
    });
    this.ovenService.addLinkedService(this.ovenTime);

    this.ovenEndTime = this.accessory.getService('Microwave End Time')
      || this.accessory.addService(
        this.platform.Service.InputSource,
        'Microwave End Time',
        'NicoCata-Always3',
      )
        .setCharacteristic(this.platform.Characteristic.Identifier, 9)
        .setCharacteristic(
          this.platform.Characteristic.ConfiguredName,
          this.courseTimeEndString,
        )
        .setCharacteristic(
          this.platform.Characteristic.IsConfigured,
          this.platform.Characteristic.IsConfigured.CONFIGURED,
        )
        .setCharacteristic(
          this.platform.Characteristic.InputSourceType,
          this.platform.Characteristic.InputSourceType.APPLICATION,
        )
        .setCharacteristic(
          this.platform.Characteristic.TargetVisibilityState,
          this.showTime
            ? this.platform.Characteristic.TargetVisibilityState.SHOWN
            : this.platform.Characteristic.TargetVisibilityState.HIDDEN,
        )
        .setCharacteristic(
          this.platform.Characteristic.CurrentVisibilityState,
          this.showTime
            ? this.platform.Characteristic.CurrentVisibilityState.SHOWN
            : this.platform.Characteristic.CurrentVisibilityState.HIDDEN,
        );
    this.ovenEndTime.getCharacteristic(this.platform.Characteristic.ConfiguredName).onGet(() => {
      const currentValue = this.courseTimeEndString;
      return currentValue;
    });
    this.ovenService.addLinkedService(this.ovenEndTime);

    //////////Timers

    this.ovenTimerService = this.accessory.getService('Microwave Cook Time') ||
      this.accessory.addService(this.platform.Service.Valve, 'Microwave Cook Time', 'NicoCataGaTa-OvenT2');
    this.ovenTimerService.setCharacteristic(Characteristic.Name, 'Microwave Cook Time');
    this.ovenTimerService.addOptionalCharacteristic(this.platform.Characteristic.ConfiguredName);
    this.ovenTimerService.setCharacteristic(this.platform.Characteristic.ConfiguredName, 'Microwave Cook Time');
    this.ovenTimerService.setCharacteristic(Characteristic.ValveType, Characteristic.ValveType.IRRIGATION);
    this.ovenTimerService.getCharacteristic(Characteristic.Active).onGet(this.onlineGet(() => this.remainTime() !== 0 ? 1 : 0)).onSet((value) => {
      const enabled = normalizeBoolean(value);
      if (!enabled) {
        this.stopOven();
        this.ovenTimerService.updateCharacteristic(Characteristic.Active, 0);
        this.ovenTimerService.updateCharacteristic(Characteristic.RemainingDuration, 0);
        this.ovenTimerService.updateCharacteristic(Characteristic.InUse, 0);
      } else {
        this.sendOvenCommand();
      }
    });
    this.ovenTimerService.setCharacteristic(Characteristic.InUse, this.remainTime() > 0 ? Characteristic.InUse.IN_USE : Characteristic.InUse.NOT_IN_USE);
    this.ovenTimerService.getCharacteristic(Characteristic.RemainingDuration)
      .setProps({
        maxValue: 32400, // 9hours
      }).onGet(this.onlineGet(() => this.remainTime()));
    this.ovenTimerService.getCharacteristic(this.platform.Characteristic.SetDuration)
      .setProps({
        maxValue: 32400, // 9hours
      }).onGet(this.onlineGet(() => this.oventTargetTime())).onSet((value) => {
        const vNum = normalizeNumber(value);
        if (vNum === null) {
          this.platform.log.error('SetDuration is not a number');
          return;
        }
        this.pauseUpdate = true;
        this.platform.log.debug('Cooking Duration set to to: ' + this.secondsToTime(vNum));
        this.ovenCommandList.ovenSetDuration = vNum;
      });
    this.ovenAlarmService = this.accessory.getService('Microwave Timer') ||
      this.accessory.addService(this.platform.Service.Valve, 'Microwave Timer', 'NicoCataGaTa-OvenT32');
    this.ovenAlarmService.setCharacteristic(Characteristic.Name, 'Microwave Timer');
    this.ovenAlarmService.addOptionalCharacteristic(this.platform.Characteristic.ConfiguredName);
    this.ovenAlarmService.setCharacteristic(this.platform.Characteristic.ConfiguredName, 'Microwave Timer');
    this.ovenAlarmService.setCharacteristic(Characteristic.ValveType, Characteristic.ValveType.IRRIGATION);
    this.ovenAlarmService.getCharacteristic(Characteristic.Active).onGet(this.onlineGet(() => this.ovenTimerTime() !== 0 ? 1 : 0)).onSet((value) => {
      const enabled = normalizeBoolean(value);
      if (!enabled) {
        this.timerAlarmSec = 0;
        this.sendTimerCommand(0);
        this.ovenAlarmService.updateCharacteristic(Characteristic.Active, 0);
        this.ovenAlarmService.updateCharacteristic(Characteristic.RemainingDuration, 0);
        this.ovenAlarmService.updateCharacteristic(Characteristic.InUse, 0);
      } else {
        this.sendTimerCommand(this.timerAlarmSec);
        this.ovenAlarmService.updateCharacteristic(Characteristic.Active, 1);
        this.ovenAlarmService.updateCharacteristic(Characteristic.RemainingDuration, this.timerAlarmSec);
        this.ovenAlarmService.updateCharacteristic(Characteristic.InUse, 1);
      }
    });
    this.ovenAlarmService.setCharacteristic(Characteristic.InUse, this.ovenTimerTime() > 0 ? Characteristic.InUse.IN_USE : Characteristic.InUse.NOT_IN_USE);
    this.ovenAlarmService.getCharacteristic(Characteristic.RemainingDuration)
      .setProps({
        maxValue: (6000 - 1), // 100 minutes
      }).onGet(this.onlineGet(() => this.ovenTimerTime()));
    this.ovenAlarmService.getCharacteristic(this.platform.Characteristic.SetDuration)
      .setProps({
        maxValue: (6000 - 1), // 100 minutes
        minStep: 60,
      }).onGet(this.onlineGet(() => this.timerAlarmSec)).onSet((value) => {
        let vNum = normalizeNumber(value);
        if (vNum === null) {
          this.platform.log.error('SetDuration is not a number');
          return;
        }
        if (vNum >= 6000) {
          vNum = 6000 - 1;
        }
        this.timerAlarmSec = vNum;
      });

    ///////////Switches

    this.microwaveSwitch = accessory.getService('Microwave Mode') ||
      accessory.addService(this.platform.Service.Switch, 'Microwave Mode', 'CataNicoGaTa-80M');
    this.microwaveSwitch.addOptionalCharacteristic(this.platform.Characteristic.ConfiguredName);
    this.microwaveSwitch.setCharacteristic(this.platform.Characteristic.ConfiguredName, 'Microwave Mode');
    this.microwaveSwitch.getCharacteristic(this.platform.Characteristic.On).onGet(() => {
      const currentValue = false;
      return currentValue;
    }).onSet((value) => {
      if (value) {
        this.ovenCommandList.ovenMode = 'MICROWAVE';
      }
      this.updateOvenModeSwitch();
    });


    this.combiBakeSwitch = accessory.getService('Combination Bake Mode') ||
      accessory.addService(this.platform.Service.Switch, 'Combination Bake Mode', 'CataNicoGaTa-80B');
    this.combiBakeSwitch.addOptionalCharacteristic(this.platform.Characteristic.ConfiguredName);
    this.combiBakeSwitch.setCharacteristic(this.platform.Characteristic.ConfiguredName, 'Combination Bake Mode');
    this.combiBakeSwitch.getCharacteristic(this.platform.Characteristic.On).onGet(() => {
      const currentValue = false;
      return currentValue;
    }).onSet((value) => {
      if (value) {
        this.ovenCommandList.ovenMode = 'COMBI_BAKE';
      }
      this.updateOvenModeSwitch();
    });
    this.dehydrateSwitch = accessory.getService('Dehydrate Mode') ||
      accessory.addService(this.platform.Service.Switch, 'Dehydrate Mode', 'CataNicoGaTa-80d');
    this.dehydrateSwitch.addOptionalCharacteristic(this.platform.Characteristic.ConfiguredName);
    this.dehydrateSwitch.setCharacteristic(this.platform.Characteristic.ConfiguredName, 'Dehydrate Mode');
    this.dehydrateSwitch.getCharacteristic(this.platform.Characteristic.On).onGet(() => {
      const currentValue = false;
      return currentValue;
    }).onSet((value) => {
      if (value) {
        this.ovenCommandList.ovenMode = 'DEHYDRATE';
      }
      this.updateOvenModeSwitch();
    });

    this.ovenSwitch = accessory.getService('Oven Mode') ||
      accessory.addService(this.platform.Service.Switch, 'Oven Mode', 'CataNicoGaTa-80OVen');
    this.ovenSwitch.addOptionalCharacteristic(this.platform.Characteristic.ConfiguredName);
    this.ovenSwitch.setCharacteristic(this.platform.Characteristic.ConfiguredName, 'Oven Mode');
    this.ovenSwitch.getCharacteristic(this.platform.Characteristic.On).onGet(() => {
      const currentValue = false;
      return currentValue;
    }).onSet((value) => {
      if (value) {
        this.ovenCommandList.ovenMode = 'OVEN';
      }
      this.updateOvenModeSwitch();
    });
    this.convectionBakeSwitch = accessory.getService('Convection Bake Mode') ||
      accessory.addService(this.platform.Service.Switch, 'Convection Bake Mode', 'CataNicoGaTa-Control1');
    this.convectionBakeSwitch.addOptionalCharacteristic(this.platform.Characteristic.ConfiguredName);
    this.convectionBakeSwitch.setCharacteristic(this.platform.Characteristic.ConfiguredName, 'Convection Bake Mode');
    this.convectionBakeSwitch.getCharacteristic(this.platform.Characteristic.On).onGet(() => {
      const currentValue = false;
      return currentValue;
    }).onSet((value) => {
      const enabled = normalizeBoolean(value);
      if (enabled) {
        this.ovenCommandList.ovenMode = 'CONV_BAKE';
      }
      this.updateOvenModeSwitch();
    });

    this.convectionRoastSwitch = accessory.getService('Combination Roast Mode') ||
      accessory.addService(this.platform.Service.Switch, 'Combination Roast Mode', 'CataNicoGaTa-Control2');
    this.convectionRoastSwitch.addOptionalCharacteristic(this.platform.Characteristic.ConfiguredName);
    this.convectionRoastSwitch.setCharacteristic(this.platform.Characteristic.ConfiguredName, 'Combination Roast Mode');
    this.convectionRoastSwitch.getCharacteristic(this.platform.Characteristic.On).onGet(() => {
      const currentValue = false;
      return currentValue;
    }).onSet((value) => {
      const enabled = normalizeBoolean(value);
      if (enabled) {
        this.ovenCommandList.ovenMode = 'COMBI_ROAST';
      }
      this.updateOvenModeSwitch();
    });

    this.frozenMealSwitch = accessory.getService('Time Defrost Mode') ||
      accessory.addService(this.platform.Service.Switch, 'Time Defrost Mode', 'CataNicoGaTa-Control3');
    this.frozenMealSwitch.addOptionalCharacteristic(this.platform.Characteristic.ConfiguredName);
    this.frozenMealSwitch.setCharacteristic(this.platform.Characteristic.ConfiguredName, 'Time Defrost Mode');
    this.frozenMealSwitch.getCharacteristic(this.platform.Characteristic.On).onGet(() => {
      const currentValue = false;
      return currentValue;
    }).onSet((value) => {
      const enabled = normalizeBoolean(value);
      if (enabled) {
        this.ovenCommandList.ovenMode = 'TIME_DEFROST';
      }
      this.updateOvenModeSwitch();
    });
    this.defrostSwitch = accessory.getService('Defrost Mode') ||
      accessory.addService(this.platform.Service.Switch, 'Defrost Mode', 'CataNicoGaTa-Control3D');
    this.defrostSwitch.addOptionalCharacteristic(this.platform.Characteristic.ConfiguredName);
    this.defrostSwitch.setCharacteristic(this.platform.Characteristic.ConfiguredName, 'Defrost Mode');
    this.defrostSwitch.getCharacteristic(this.platform.Characteristic.On).onGet(() => {
      const currentValue = false;
      return currentValue;
    }).onSet((value) => {
      const enabled = normalizeBoolean(value);
      if (enabled) {
        this.ovenCommandList.ovenMode = 'INVERTER_DEFROST';
      }
      this.updateOvenModeSwitch();
    });

    this.airFrySwitch = accessory.getService('Air Fry Mode') ||
      accessory.addService(this.platform.Service.Switch, 'Air Fry Mode', 'CataNicoGaTa-Control4');
    this.airFrySwitch.addOptionalCharacteristic(this.platform.Characteristic.ConfiguredName);
    this.airFrySwitch.setCharacteristic(this.platform.Characteristic.ConfiguredName, 'Air Fry Mode');
    this.airFrySwitch.getCharacteristic(this.platform.Characteristic.On).onGet(() => {
      const currentValue = false;
      return currentValue;
    }).onSet((value) => {
      const enabled = normalizeBoolean(value);
      if (enabled) {
        this.ovenCommandList.ovenMode = 'AIRFRY';
      }
      this.updateOvenModeSwitch();
    });
    this.proofSwitch = accessory.getService('Proof Mode') ||
      accessory.addService(this.platform.Service.Switch, 'Proof Mode', 'CataNicoGaTa-Control5');
    this.proofSwitch.addOptionalCharacteristic(this.platform.Characteristic.ConfiguredName);
    this.proofSwitch.setCharacteristic(this.platform.Characteristic.ConfiguredName, 'Proof Mode');
    this.proofSwitch.getCharacteristic(this.platform.Characteristic.On).onGet(() => {
      const currentValue = false;
      return currentValue;
    }).onSet((value) => {
      const enabled = normalizeBoolean(value);
      if (enabled) {
        this.ovenCommandList.ovenMode = 'PROOF';
      }
      this.updateOvenModeSwitch();
    });

    this.warmModeSwitch = accessory.getService('Warm Mode (High)') ||
      accessory.addService(this.platform.Service.Switch, 'Warm Mode (High)', 'CataNicoGaTa-Control5W');
    this.warmModeSwitch.addOptionalCharacteristic(this.platform.Characteristic.ConfiguredName);
    this.warmModeSwitch.setCharacteristic(this.platform.Characteristic.ConfiguredName, 'Warm Mode (High)');
    this.warmModeSwitch.getCharacteristic(this.platform.Characteristic.On).onGet(() => {
      const currentValue = false;
      return currentValue;
    }).onSet((value) => {
      const enabled = normalizeBoolean(value);
      if (enabled) {
        this.ovenCommandList.ovenMode = 'WARM';
      }
      this.updateOvenModeSwitch();
    });
    this.cancelSwitch = accessory.getService('Stop Microwave') ||
      accessory.addService(this.platform.Service.Switch, 'Stop Microwave', 'CataNicoGaTa-Control6');
    this.cancelSwitch.addOptionalCharacteristic(this.platform.Characteristic.ConfiguredName);
    this.cancelSwitch.setCharacteristic(this.platform.Characteristic.ConfiguredName, 'Stop Microwave');
    this.cancelSwitch.getCharacteristic(this.platform.Characteristic.On).onGet(() => {
      const currentValue = false;
      return currentValue;
    }).onSet((value) => {
      const enabled = normalizeBoolean(value);
      if (enabled) {
        this.stopOven();
      }
      setTimeout(() => {
        this.cancelSwitch.updateCharacteristic(this.platform.Characteristic.On, false);
      }, 1000);
      this.updateOvenModeSwitch();
    });
    this.startOvenSwitch = accessory.getService('Start Microwave') ||
      accessory.addService(this.platform.Service.Switch, 'Start Microwave', 'CataNicoGaTa-Control8');
    this.startOvenSwitch.addOptionalCharacteristic(this.platform.Characteristic.ConfiguredName);
    this.startOvenSwitch.setCharacteristic(this.platform.Characteristic.ConfiguredName, 'Start Microwave');
    this.startOvenSwitch.getCharacteristic(this.platform.Characteristic.On).onGet(() => {
      const currentValue = false;
      return currentValue;
    }).onSet((value) => {
      const enabled = normalizeBoolean(value);
      if (enabled) {
        this.sendOvenCommand();
        setTimeout(() => {
          this.startOvenSwitch.updateCharacteristic(this.platform.Characteristic.On, false);
        }, 1000);
      }
    });
    /////////Temperature Control
    this.ovenTempControl = this.accessory.getService('Microwave Oven Temperature Control') ||
      this.accessory.addService(this.platform.Service.Thermostat, 'Microwave Oven Temperature Control', 'NicoCataGaTa-OvenTC')
        .setCharacteristic(this.platform.Characteristic.Name, 'Microwave Oven Temperature Control')
        .setCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState, this.currentHeatingState())
        .setCharacteristic(this.platform.Characteristic.TemperatureDisplayUnits, 1);
    this.ovenTempControl.addOptionalCharacteristic(this.platform.Characteristic.ConfiguredName);
    this.ovenTempControl.setCharacteristic(this.platform.Characteristic.ConfiguredName, 'Microwave Oven Temperature Control');
    this.ovenTempControl.getCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState)
      .onGet(this.onlineGet(() => this.currentHeatingState()));
    this.ovenTempControl.getCharacteristic(this.platform.Characteristic.TemperatureDisplayUnits)
      .onGet(this.onlineGet(() => temperatureDisplayUnitsValue(this.Status.data, 'LWOTargetTemperatureUnit')));
    this.ovenTempControl.getCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState)
      .setProps({
        validValues: [
          this.platform.Characteristic.TargetHeatingCoolingState.OFF,
          this.platform.Characteristic.TargetHeatingCoolingState.HEAT,
        ],
      })
      .onGet(this.onlineGet(() => this.targetHeatingState()))
      .onSet((value) => {
        const enabled = normalizeBoolean(value);
        if (!enabled) {
          this.stopOven();
        } else {
          this.pauseUpdate = true;
        }
      });
    this.ovenTempControl.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
      .setProps({
        minValue: 10,
        maxValue: 233,
        minStep: 0.5,
      }).onGet(this.onlineGet(() => this.ovenCurrentTemperature()));
    this.ovenTempControl.getCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity).onGet(this.onlineGet(() => this.localHumidity));
    this.ovenTempControl.getCharacteristic(this.platform.Characteristic.TargetTemperature)
      .setProps({
        minValue: 38,
        maxValue: 233,
        minStep: 0.5,
      }).onGet(this.onlineGet(() => this.ovenTargetTemperature())).onSet((value) => {
        const vNum = normalizeNumber(value);
        if (vNum === null) {
          this.platform.log.error('TargetTemperature is not a number');
          return;
        }
        if (isFahrenheitUnit(this.Status.data, 'LWOTargetTemperatureUnit')) {
          this.ovenCommandList.ovenSetTemperature = Math.round(this.tempCtoF(vNum) / 5) * 5;
        } else {
          this.ovenCommandList.ovenSetTemperature = Math.round(vNum / 5) * 5;
        }
      });


  }
  //////////////////



  async timeModeCommand() {
    if (!this.isOnlineForHomeKit) {
      return;
    }

    const ctrlKey = 'SetPreference';
    const device = this.accessory.context.device;
    await this.platform.ThinQ?.deviceControl(device, {
      dataKey: null,
      dataValue: null,
      dataSetList: {
        ovenState: {
          'cmdOptionContentsType': 'REMOTE_SETTING',
          'cmdOptionDataLength': 'REMOTE_SETTING',
          'mwoSettingClockSetTimeHour': 128,
          'mwoSettingClockSetTimeMin': 128,
          'mwoSettingClockSetHourMode': '24H_MODE',
          'mwoSettingSound': 'NOT_SET',
          'mwoSettingClockDisplay': 'NOT_SET',
          'mwoSettingDisplayScrollSpeed': 'SLOW',
          'mwoSettingDefrostWeightMode': 'NOT_SET',
          'mwoSettingDemoMode': 'NOT_SET',
        },
      },
      dataGetList: null,
    }, 'Set', ctrlKey);
  }

  async sendLightVentCommand() {
    if (!this.isOnlineForHomeKit) {
      return;
    }

    this.platform.log.debug('Fan Speed: ' + this.ventSpeed + ' Light: ' + this.lampLevel);
    const device = this.accessory.context.device;
    const ventLampCommand = microwaveVentLampCommand(this.ventSpeed, this.lampLevel);
    await this.platform.ThinQ?.deviceControl(device, ventLampCommand.payload, ventLampCommand.command, ventLampCommand.ctrlKey);
  }

  async sendTimerCommand(time: number) {
    if (!this.isOnlineForHomeKit) {
      return;
    }

    if (!this.waitingForCommand) {
      this.platform.log.debug('Alarm Set to: ' + this.secondsToTime(time));
      const device = this.accessory.context.device;
      const timerCommand = microwaveTimerCommand(time);
      await this.platform.ThinQ?.deviceControl(device, timerCommand.payload, timerCommand.command, timerCommand.ctrlKey);
      this.waitingForCommand = true;
      setTimeout(() => {
        this.pauseUpdate = false;
        this.firstPause = true;
      }, 10000);
    }
    setTimeout(() => {
      this.waitingForCommand = false;
    }, 1000);
  }

  async sendOvenCommand() {
    if (!this.isOnlineForHomeKit) {
      return;
    }

    if (!this.monitorOnly) {
      if (!this.waitingForCommand) {
        this.pauseUpdate = true;
        this.ovenCommandList.tempUnits = snapshotString(this.Status.data, 'LWOTargetTemperatureUnit', 'FAHRENHEIT');
        this.ovenCommandList = prepareMicrowaveCookCommand(this.ovenCommandList, this.mwPower);
        const debugMsg = 'Sending the Folowing Commands to the Microwave: ' + JSON.stringify(this.ovenCommandList);
        this.platform.log.debug(debugMsg);
        const device = this.accessory.context.device;
        const microwaveCommand = microwaveRemoteStartCommand(this.ovenCommandList);
        await this.platform.ThinQ?.deviceControl(device.id, microwaveCommand.payload, microwaveCommand.command, microwaveCommand.ctrlKey);
        this.waitingForCommand = true;
        setTimeout(() => {
          this.pauseUpdate = false;
          this.firstPause = true;
        }, 10000);
      }
      setTimeout(() => {
        this.waitingForCommand = false;
      }, 1000);

    }
  }

  async stopOven() {
    if (!this.isOnlineForHomeKit) {
      return;
    }

    if (!this.monitorOnly) {
      if (!this.waitingForCommand) {
        this.pauseUpdate = true;
        this.platform.log.debug('Stop Command Sent to Microwave');
        const device = this.accessory.context.device;
        const stopCommand = cookingStopCommand();
        await this.platform.ThinQ?.deviceControl(device.id, stopCommand.payload, stopCommand.command, stopCommand.ctrlKey);
        this.waitingForCommand = true;
        setTimeout(() => {
          this.pauseUpdate = false;
          this.firstPause = true;
        }, 10000);
      }
      setTimeout(() => {
        this.waitingForCommand = false;
      }, 1000);
    }
  }

  setActive() {
    this.platform.log.debug('Microwave Response: ', this.Status.data);
    //  this.platform.log('Oven Response 2', this.Status.deviceModel.DeviceModel.data.ControlWifi);
    // this.platform.log('Oven Response 3', this.Status.deviceModel.DeviceModel.data.UpperManualCook);
    //this.platform.log('Oven Response 4', this.Status.deviceModel.DeviceModel.data.Monitoring);
    // this.platform.log('Dishwasher rinse', this.Status.data.rinseLevel);
    //  this.platform.log('Dishwasher rinse typeof', typeof this.Status.data.rinseLevel);
    //this.updateRinseLevel();
    //  this.platform.log('Dishwasher rinse status', this.rinseStatus);
    // this.serviceDishwasher.updateCharacteristic(this.platform.Characteristic.StatusFault, this.rinseStatus);
    // this.platform.log('Dishwasher Response', this.Status);
    // throw new this.platform.api.hap.HapStatusError(-70412 /* this.platform.api.hap.HAPStatus.NOT_ALLOWED_IN_CURRENT_STATE */);
  }

  onStatus() {
    return hasActiveCookingState(this.Status.data, 'LWOState');
  }

  lightVentState() {
    return this.onStatus()
      || hasNonZeroSnapshotNumber(this.Status.data, 'mwoVentSpeedLevel')
      || hasNonZeroSnapshotNumber(this.Status.data, 'mwoLampLevel');
  }

  nameLengthCheck(newName: string) {
    if (newName.length >= 64) {
      newName = newName.slice(0, 60) + '...';
    }
    return newName;
  }

  secondsToTime(seconds: number) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor(seconds % 3600 / 60);
    const s = Math.floor(seconds % 60);
    return h + ':' + m + ':' + s + ' Hours';
  }

  remainTime() {
    return durationFromSnapshot(
      this.Status.data,
      'LWORemainTimeHour',
      'LWORemainTimeMinute',
      'LWORemainTimeSecond',
    );
  }

  ovenModeName() {
    this.inputNameMode = 'Microwave Mode: ';
    switch (this.Status.data?.LWOManualCookName) {
    case 'STANDBY':
      this.inputNameMode += 'Standby';
      break;
    case 'MICROWAVE':
      this.inputNameMode += 'Microwave';
      break;
    case 'GRILL':
      this.inputNameMode += 'Grill';
      break;
    case 'OVEN':
      this.inputNameMode += 'Oven';
      break;
    case 'COMBI':
      this.inputNameMode += 'Combination';
      break;
    case 'COMBI_BAKE':
      this.inputNameMode += 'Combination Bake';
      break;
    case 'COMBI_ROAST':
      this.inputNameMode += 'Combination Roast';
      break;
    case 'INVERTER_DEFROST':
      this.inputNameMode += 'Inverter Defrost';
      break;
    case 'AUTO_COOK':
      this.inputNameMode += 'Air Fry';
      break;
    case 'AIRFRY':
      this.inputNameMode += 'Air Fry';
      break;
    case 'WARM':
      this.inputNameMode += 'Warm';
      break;
    case 'CONV_BAKE':
      this.inputNameMode += 'Convection Bake';
      break;
    case 'BROIL':
      this.inputNameMode += 'Broil';
      break;
    case 'DEHYDRATE':
      this.inputNameMode += 'Dehydrate';
      break;
    case 'SPEED_CONV':
      this.inputNameMode += 'Speed Convection';
      break;
    case 'SPEED_ROAST':
      this.inputNameMode += 'Speed Roast';
      break;
    case 'SPEED_BROIL':
      this.inputNameMode += 'Speed Broil';
      break;
    case 'PROOF':
      this.inputNameMode += 'Proof';
      break;
    case 'SENSOR_COOK':
      this.inputNameMode += 'Sensor Cook';
      break;
    case 'TIME_DEFROST':
      this.inputNameMode += 'Timed Defrost';
      break;
    default:
      // eslint-disable-next-line no-case-declarations
      let cookName = snapshotString(this.Status.data, 'LWOManualCookName', 'unknown');
      cookName = cookName.toLocaleLowerCase();
      // eslint-disable-next-line no-case-declarations
      const cookNameCap =
          cookName.charAt(0).toUpperCase()
          + cookName.slice(1);
      this.inputNameMode += cookNameCap;

    }
    if (!this.inputNameMode.includes('Standby')) {
      this.inputNameMode = this.OvenSubCookMenu(this.inputNameMode);
    }
    return this.nameLengthCheck(this.inputNameMode);
  }

  ovenStatus() {
    this.inputNameStatus = 'Microwave is ';
    switch (this.Status.data?.LWOState) {
    case 'INITIAL':
      this.inputNameStatus += 'in Standby';
      break;
    case 'PREHEATING':
      this.inputNameStatus += 'Preheating';
      break;
    case 'COOKING_IN_PROGRESS':
      this.inputNameStatus += 'Cooking';
      break;
    case 'DONE':
      this.inputNameStatus += 'Done Baking';
      break;
    case 'COOLING':
      this.inputNameStatus += 'Cooling Down';
      break;
    case 'CLEANING':
      this.inputNameStatus += 'Cleaning Itself';
      break;
    case 'CLEANING_DONE':
      this.inputNameStatus += 'Done Cleaning Itself';
      break;
    case 'PAUSED':
      this.inputNameStatus += 'Paused';
      break;
    case 'PREFERENCE':
      this.inputNameStatus += 'Preference';
      break;
    case 'ERROR':
      this.inputNameStatus += 'Not Working';
      break;
    case 'READY_TO_START':
      this.inputNameStatus += 'Ready To Start';
      break;
    case 'PREHEATING_IS_DONE':
      this.inputNameStatus += 'Done Preheating';
      break;
    default:
      // eslint-disable-next-line no-case-declarations
      let stateName = snapshotString(this.Status.data, 'LWOState', 'unknown');
      stateName = stateName.toLocaleLowerCase();
      // eslint-disable-next-line no-case-declarations
      const stateNameCap =
          stateName.charAt(0).toUpperCase()
          + stateName.slice(1);
      this.inputNameStatus += stateNameCap;

    }
    return this.nameLengthCheck(this.inputNameStatus);
  }

  ovenTemperature() {
    /////Current Temp
    let temperature = 'Microwave Oven Temperature Information';
    const currentTemperature = snapshotNumber(this.Status.data, 'upperCurrentTemperatureValue');
    if (currentTemperature !== 0) {
      temperature = 'Current Temp is ' + currentTemperature + '°';
    }

    ////Set temperature
    const targetTemperature = snapshotNumber(this.Status.data, 'LWOTargetTemperatureValue');
    if (targetTemperature !== 0) {
      temperature += ' With Set Temp ' + targetTemperature + '°';
    }

    ////Default
    if (targetTemperature === 0 && this.defaultTemp !== 0 && currentTemperature === 0) {
      temperature += 'Current Temp is ' + this.defaultTemp + '°' + ' With Set Temp ' + this.defaultTemp + '°';
    }

    return this.nameLengthCheck(temperature);
  }

  ovenCurrentTemperature() {
    const snapshotTemperature = homeKitTemperatureFromSnapshot(this.Status.data, 'upperCurrentTemperatureValue', 'LWOTargetTemperatureUnit')
      ?? homeKitTemperatureFromSnapshot(this.Status.data, 'LWOTargetTemperatureValue', 'LWOTargetTemperatureUnit');
    if (snapshotTemperature !== undefined) {
      return snapshotTemperature;
    } else if (snapshotString(this.Status.data, 'LWOState').includes('COOKING_IN_PROGRESS') && this.defaultTemp !== 0) {
      return this.tempFtoC(this.defaultTemp);
    } else if (snapshotString(this.Status.data, 'LWOState').includes('PREHEATING') && this.defaultTemp !== 0) {
      return this.tempFtoC(this.defaultTemp);
    } else {
      return this.localTemperature;
    }
  }

  ovenTargetTemperature() {
    ////Set temperature
    const snapshotTemperature = homeKitTemperatureFromSnapshot(this.Status.data, 'LWOTargetTemperatureValue', 'LWOTargetTemperatureUnit');
    if (snapshotTemperature !== undefined) {
      return snapshotTemperature;
    } else if (snapshotString(this.Status.data, 'LWOState').includes('COOKING_IN_PROGRESS') && this.defaultTemp !== 0) {
      return this.tempFtoC(this.defaultTemp);
    } else if (snapshotString(this.Status.data, 'LWOState').includes('PREHEATING') && this.defaultTemp !== 0) {
      return this.tempFtoC(this.defaultTemp);
    } else {
      return 38;
    }
  }

  OvenSubCookMenu(name: string) {
    if (this.Status.data?.LWOSubCookName !==
      0 && typeof this.Status.data?.LWOSubCookName !== 'undefined') {
      let subCookCap: string;
      switch (this.Status.data?.LWOSubCookName) {
      case 3335:
        subCookCap = 'Buffalo Wings';
        this.defaultTemp = 450;
        break;
      case 3212:
        subCookCap = 'Chicken Nuggets';
        this.defaultTemp = 450;
        break;
      case 3227:
        subCookCap = 'Chicken Tenders';
        this.defaultTemp = 450;
        break;
      case 3339:
        subCookCap = 'Fish Sticks';
        this.defaultTemp = 450;
        break;
      case 3253:
        subCookCap = 'French Fries';
        this.defaultTemp = 450;
        break;
      case 3345:
        subCookCap = 'Hash Brown Patties';
        this.defaultTemp = 450;
        break;
      case 3336:
        subCookCap = 'Mozzarella Sticks';
        this.defaultTemp = 450;
        break;
      case 3343:
        subCookCap = 'Popcorn Shrimp';
        this.defaultTemp = 450;
        break;
      case 3225:
        subCookCap = 'Potato Wedges';
        this.defaultTemp = 450;
        break;
      case 211:
        subCookCap = 'Meat';
        this.defaultTemp = 350;
        break;
      case 212:
        subCookCap = 'Poultry';
        this.defaultTemp = 425;
        break;
      case 213:
        subCookCap = 'Fish';
        this.defaultTemp = 400;
        break;
      case 214:
        subCookCap = 'Bread';
        this.defaultTemp = 400;
        break;
      default:
        subCookCap = 'Other Food';
        this.defaultTemp = 450;

      }
      return name + ' (' + subCookCap + ')';
    }
    return name;
  }

  oventTargetTime() {
    return durationFromSnapshot(
      this.Status.data,
      'LWOTargetTimeHour',
      'LWOTargetTimeMinute',
      'LWOTargetTimeSecond',
    );
  }

  ovenTimerTime() {
    return durationFromSnapshot(
      this.Status.data,
      'LWOTimerHour',
      'LWOTimerMinute',
      'LWOTimerSecond',
    );
  }

  tempCtoF(temp: number) {
    return Math.round(temp * 1.8 + 32);
  }

  tempFtoC(temp: number) {
    return 0.5 * Math.round(2 * (temp - 32) / 1.8);
  }

  //////////////////
  ovenCookingDuration() {
    /////Cycle duration
    const courseTime = new Date(0);
    courseTime.setSeconds(this.oventTargetTime());
    let courseTimeString = courseTime.toISOString().substr(11, 8);

    if (courseTimeString.startsWith('0')) {
      courseTimeString = courseTimeString.substring(1);
    }
    let hourMinutes = 'Minutes';
    if (this.oventTargetTime() > 3600) {
      hourMinutes = 'Hours';
    }
    if (this.oventTargetTime() === 3600) {
      hourMinutes = 'Hour';

    }
    return 'Duration: ' + courseTimeString + ' ' + hourMinutes;
  }

  ovenCookingTimer() {
    const courseTimer = new Date(0);
    courseTimer.setSeconds(this.ovenTimerTime());
    let courseTimerString = courseTimer.toISOString().substr(11, 8);

    if (courseTimerString.startsWith('0')) {
      courseTimerString = courseTimerString.substring(1);
    }
    let hourMinutes = 'Minutes';
    if (this.ovenTimerTime() > 3600) {
      hourMinutes = 'Hours';
    }
    if (this.ovenTimerTime() === 3600) {
      hourMinutes = 'Hour';

    }
    return 'Timer: ' + courseTimerString + ' ' + hourMinutes;
  }

  ovenCookingStartTime() {
    ////Starting time
    const courseStart = new Date();
    const newDate = courseStart.toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour12: false,
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      timeZoneName: 'short',
    });
    return 'Start: ' + newDate;
  }

  ovenCookingEndTime() {
    const courseCurrentTime = new Date();
    this.courseStartMS = courseCurrentTime.getTime();
    const dateEnd = new Date(this.oventTargetTime() * 1000 + this.courseStartMS);
    const newEndDate = dateEnd.toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour12: false,
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      timeZoneName: 'short',
    });
    return 'End: ' + newEndDate;
  }

  oventOptions() {
    this.inputNameOptions = 'Settings: ';
    if (isFahrenheitUnit(this.Status.data, 'LWOTargetTemperatureUnit')) {
      this.inputNameOptions += 'Temp in °F';
    } else {
      this.inputNameOptions += 'Temp in °C';
    }
    if (!snapshotString(this.Status.data, 'LWOSabbath').includes('NOT')) {
      this.inputNameOptions += ', Sabbath On';
    }
    if (snapshotString(this.Status.data, 'LWOControlLock').includes('ENA')) {
      this.inputNameOptions += ', Control Lock';
    }
    return this.nameLengthCheck(this.inputNameOptions);
  }

  ///////////
  currentHeatingState() {
    if (hasNonZeroSnapshotNumber(this.Status.data, 'upperCurrentTemperatureValue')
      || this.defaultTemp !== 0
      || hasNonZeroSnapshotNumber(this.Status.data, 'LWOTargetTemperatureValue')) {
      return 1;
    } else {
      return 0;
    }
  }

  targetHeatingState() {
    if (hasNonZeroSnapshotNumber(this.Status.data, 'LWOTargetTemperatureValue') || this.defaultTemp !== 0) {
      return 1;
    } else {
      return 0;
    }
  }

  updateOvenModeSwitch() {
    this.pauseUpdate = true;
    this.updateOvenModeSwitchNoPause();
  }

  updateOvenModeSwitchNoPause() {
    this.microwaveSwitch.updateCharacteristic(this.platform.Characteristic.On, this.ovenCommandList.ovenMode === 'MICROWAVE' ? true : false);
    this.combiBakeSwitch.updateCharacteristic(this.platform.Characteristic.On, this.ovenCommandList.ovenMode === 'COMBI_BAKE' ? true : false);
    this.dehydrateSwitch.updateCharacteristic(this.platform.Characteristic.On, this.ovenCommandList.ovenMode === 'DEHYDRATE' ? true : false);
    this.airFrySwitch.updateCharacteristic(this.platform.Characteristic.On, this.ovenCommandList.ovenMode === 'AIRFRY' ? true : false);
    this.proofSwitch.updateCharacteristic(this.platform.Characteristic.On, this.ovenCommandList.ovenMode === 'PROOF' ? true : false);
    this.warmModeSwitch.updateCharacteristic(this.platform.Characteristic.On, this.ovenCommandList.ovenMode === 'WARM' ? true : false);
    this.convectionBakeSwitch.updateCharacteristic(this.platform.Characteristic.On, this.ovenCommandList.ovenMode === 'CONV_BAKE' ? true : false);
    this.convectionRoastSwitch.updateCharacteristic(this.platform.Characteristic.On, this.ovenCommandList.ovenMode === 'COMBI_ROAST' ? true : false);
    this.defrostSwitch.updateCharacteristic(this.platform.Characteristic.On, this.ovenCommandList.ovenMode === 'INVERTER_DEFROST' ? true : false);
    this.frozenMealSwitch.updateCharacteristic(this.platform.Characteristic.On, this.ovenCommandList.ovenMode === 'TIME_DEFROST' ? true : false);
  }

  getOperationTime(timeInSeconds: number) {
    const newTime = new Date(0);
    newTime.setSeconds(timeInSeconds);
    const newTimeString = newTime.toLocaleTimeString();
    let hourMinutes = 'Minutes';
    if (timeInSeconds > 3600) {
      hourMinutes = 'Hours';
    }
    if (timeInSeconds === 3600) {
      hourMinutes = 'Hour';

    }
    return newTimeString + ' ' + hourMinutes;
  }

  lightVentStatus() {
    let lightVent = '';
    const lampLevel = snapshotNumber(this.Status.data, 'mwoLampLevel');
    const ventSpeedLevel = snapshotNumber(this.Status.data, 'mwoVentSpeedLevel');
    if (lampLevel === 0) {

      lightVent = 'Light is Off';
    } else if (lampLevel === 1) {
      lightVent = 'Light is set to Low';
    } else if (lampLevel === 2) {
      lightVent = 'Light is set to High';
    }
    if (ventSpeedLevel > 0) {
      lightVent += ' and Vent is set to Level ' + ventSpeedLevel;
    } else {
      lightVent += ' and Vent is Off';
    }
    return lightVent;
  }

  ovenServiceActive() {
    return this.lightVentState() ? 1 : 0;
  }

  //////////////
  updateAccessoryCharacteristic(device: Device) {
    super.updateAccessoryCharacteristic(device);
    //this.platform.log('Device Response', device)
    //const ovenState = device.snapshot.ovenState;
    //const isVentOn = ovenState['ventSet'] === device.deviceModel.lookupMonitorName('VentSet', '@CP_ENABLE_W');
    //const isLampOn = ovenState['lampSet'] === device.deviceModel.lookupMonitorName('LampSet', '@CP_ENABLE_W');
    const { Characteristic } = this.platform;
    //this.serviceHood.updateCharacteristic(Characteristic.On, isVentOn);
    // this.serviceHood.updateCharacteristic(Characteristic.RotationSpeed, ovenState['ventLevel']);
    //this.serviceLight.updateCharacteristic(Characteristic.On, isLampOn);
    //  this.serviceLight.updateCharacteristic(Characteristic.Brightness, ovenState['lampLevel']);
    if (!this.pauseUpdate) {
      if (isInitialCookingState(this.Status.data, 'LWOState')) {
        this.defaultTemp = 0;
      }
      if (this.ovenService.getCharacteristic(this.platform.Characteristic.Active).value !== this.ovenServiceActive()) {
        this.ovenService.updateCharacteristic(this.platform.Characteristic.Active, this.ovenServiceActive());
      }
      if (this.ovenServiceActive() === 0) {
        this.ovenCommandList = {
          ovenMode: 'NONE',
          ovenSetTemperature: 0,
          tempUnits: snapshotString(this.Status.data, 'LWOTargetTemperatureUnit', 'FAHRENHEIT'),
          ovenSetDuration: 0,
          subCookNumber: 0,
          weightUnits: 'KG',
          microwavePower: '100',
          targetWeight: 0,
        };

        const anyModeOn =
          this.microwaveSwitch.getCharacteristic(this.platform.Characteristic.On).value === true
          || this.combiBakeSwitch.getCharacteristic(this.platform.Characteristic.On).value === true
          || this.dehydrateSwitch.getCharacteristic(this.platform.Characteristic.On).value === true
          || this.airFrySwitch.getCharacteristic(this.platform.Characteristic.On).value === true
          || this.proofSwitch.getCharacteristic(this.platform.Characteristic.On).value === true
          || this.warmModeSwitch.getCharacteristic(this.platform.Characteristic.On).value === true
          || this.convectionBakeSwitch.getCharacteristic(this.platform.Characteristic.On).value === true
          || this.convectionRoastSwitch.getCharacteristic(this.platform.Characteristic.On).value === true
          || this.defrostSwitch.getCharacteristic(this.platform.Characteristic.On).value === true
          || this.frozenMealSwitch.getCharacteristic(this.platform.Characteristic.On).value === true;

        if (anyModeOn) {
          this.updateOvenModeSwitch();
        }
      }
      ///// how to handle the time Here
      if (hasCookingModeActive(this.Status.data, 'LWOManualCookName', 'STAND')) {
        if (this.firstStart) {
          this.courseStartString = this.ovenCookingStartTime();
        }
        this.showTime = true;
        this.ovenCommandList.ovenMode = snapshotString(this.Status.data, 'LWOManualCookName', 'WARM');
        this.updateOvenModeSwitchNoPause();
      } else {
        this.firstStart = true;
        this.showTime = false;
        this.courseStartString = 'Microwave Start Time Not Set';
      }

      if (this.oventTargetTime() !== 0) {
        if (this.oventTargetTime() !== this.firstDuration) {
          this.firstDuration = this.oventTargetTime();
          this.courseTimeString = this.ovenCookingDuration();
          this.courseTimeEndString = this.ovenCookingEndTime();
        }
        this.showTime = true;
      } else {
        this.firstDuration = 0;
        this.courseTimeString = 'Microwave Cooking Time Not Set';
        this.courseTimeEndString = 'Microwave End Time Not Set';
      }
      if (this.ovenTimerTime() !== 0) {
        if (this.ovenTimerTime() !== this.firstTimer) {
          this.firstTimer = this.ovenTimerTime();
          this.courseTimerString = this.ovenCookingTimer();
        }
        this.showTimer = true;
      } else {
        this.firstTimer = 0;
        this.showTimer = false;
        this.courseTimerString = 'Microwave Cooking Timer Not Set';
      }
      ///////////////////
      if (this.ovenState.getCharacteristic(this.platform.Characteristic.ConfiguredName).value !== this.ovenStatus()) {
        this.ovenState.updateCharacteristic(this.platform.Characteristic.ConfiguredName, this.ovenStatus());
      }
      if (this.ovenMode.getCharacteristic(this.platform.Characteristic.ConfiguredName).value !== this.ovenModeName()) {
        this.ovenMode.updateCharacteristic(this.platform.Characteristic.ConfiguredName, this.ovenModeName());
      }
      if (this.lightVent.getCharacteristic(this.platform.Characteristic.ConfiguredName).value !== this.lightVentStatus()) {
        this.lightVent.updateCharacteristic(this.platform.Characteristic.ConfiguredName, this.lightVentStatus());
      }
      if (this.ovenTemp.getCharacteristic(this.platform.Characteristic.ConfiguredName).value !== this.ovenTemperature()) {
        this.ovenTemp.updateCharacteristic(this.platform.Characteristic.ConfiguredName, this.ovenTemperature());
      }
      if (this.ovenStart.getCharacteristic(this.platform.Characteristic.ConfiguredName).value !== this.nameLengthCheck(this.courseStartString)) {
        this.ovenStart.updateCharacteristic(this.platform.Characteristic.ConfiguredName, this.nameLengthCheck(this.courseStartString));
      }
      if (this.ovenTimer.getCharacteristic(this.platform.Characteristic.ConfiguredName).value !== this.nameLengthCheck(this.courseTimerString)) {
        this.ovenTimer.updateCharacteristic(this.platform.Characteristic.ConfiguredName, this.nameLengthCheck(this.courseTimerString));
      }
      if (this.ovenTime.getCharacteristic(this.platform.Characteristic.ConfiguredName).value !== this.nameLengthCheck(this.courseTimeString)) {
        this.ovenTime.updateCharacteristic(this.platform.Characteristic.ConfiguredName, this.nameLengthCheck(this.courseTimeString));
      }
      if (this.ovenEndTime.getCharacteristic(this.platform.Characteristic.ConfiguredName).value !== this.nameLengthCheck(this.courseTimeEndString)) {
        this.ovenEndTime.updateCharacteristic(this.platform.Characteristic.ConfiguredName, this.nameLengthCheck(this.courseTimeEndString));
      }
      if (this.ovenOptions.getCharacteristic(this.platform.Characteristic.ConfiguredName).value !== this.oventOptions()) {
        this.ovenOptions.updateCharacteristic(this.platform.Characteristic.ConfiguredName, this.oventOptions());
      }

      /////////////Show State
      const targetVisibilityState = this.platform.Characteristic.TargetVisibilityState;
      const currentVisibilityState = this.platform.Characteristic.CurrentVisibilityState;
      const updateVisibility = (service: Service, condition: boolean) => {
        const visibility = visibilityCharacteristicUpdate(condition, targetVisibilityState, currentVisibilityState);
        updateCharacteristicIfChanged(service, targetVisibilityState, visibility.targetVisibilityState);
        updateCharacteristicIfChanged(service, currentVisibilityState, visibility.currentVisibilityState);
      };

      updateVisibility(this.ovenMode, this.onStatus());
      updateVisibility(this.ovenTemp, this.onStatus());
      updateVisibility(this.lightVent, this.lightVentState());
      updateVisibility(this.ovenOptions, this.onStatus());
      updateVisibility(this.ovenStart, this.showTime);
      updateVisibility(this.ovenTime, this.showTime);
      updateVisibility(this.ovenEndTime, this.showTime);
      updateVisibility(this.ovenTimer, this.showTimer);

      /////////Temperature Monitor
      const tempDisplayUnits = temperatureDisplayUnitsValue(this.Status.data, 'LWOTargetTemperatureUnit');
      if (this.ovenTempControl.getCharacteristic(this.platform.Characteristic.TemperatureDisplayUnits).value !== tempDisplayUnits) {
        this.ovenTempControl.updateCharacteristic(this.platform.Characteristic.TemperatureDisplayUnits, tempDisplayUnits);
      }
      if (this.ovenTempControl.getCharacteristic(this.platform.Characteristic.CurrentTemperature).value !== this.ovenCurrentTemperature()) {
        this.ovenTempControl.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, this.ovenCurrentTemperature());
      }
      if (this.ovenTempControl.getCharacteristic(this.platform.Characteristic.TargetTemperature).value !== this.ovenTargetTemperature()) {
        this.ovenTempControl.updateCharacteristic(this.platform.Characteristic.TargetTemperature, this.ovenTargetTemperature());
      }
      if (this.ovenTempControl.getCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState).value !== this.targetHeatingState()) {
        this.ovenTempControl.updateCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState, this.targetHeatingState());
      }
      if (this.ovenTempControl.getCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState).value !== this.currentHeatingState()) {
        this.ovenTempControl.updateCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState, this.currentHeatingState());
      }
      if (this.ovenTempControl.getCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity).value !== this.localHumidity) {
        this.ovenTempControl.updateCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, this.localHumidity);
      }
      const microwavePowerLevel = microwavePowerPercent(this.Status.data);
      const microwavePowerOn = microwavePowerLevel > 0;
      if (this.microwavePower.getCharacteristic(this.platform.Characteristic.On).value !== microwavePowerOn) {
        this.microwavePower.updateCharacteristic(this.platform.Characteristic.On, microwavePowerOn);
      }

      if (this.microwavePower.getCharacteristic(this.platform.Characteristic.Brightness).value !== microwavePowerLevel) {
        this.microwavePower.updateCharacteristic(this.platform.Characteristic.Brightness, microwavePowerLevel);
      }

      const lampLevel = snapshotNumber(this.Status.data, 'mwoLampLevel');
      const lampOn = lampLevel > 0;
      if (this.serviceLight.getCharacteristic(this.platform.Characteristic.On).value !== lampOn) {
        this.serviceLight.updateCharacteristic(this.platform.Characteristic.On, lampOn);
      }

      if (this.serviceLight.getCharacteristic(this.platform.Characteristic.Brightness).value !== lampLevel) {
        this.serviceLight.updateCharacteristic(this.platform.Characteristic.Brightness, lampLevel);
      }

      const ventSpeedLevel = snapshotNumber(this.Status.data, 'mwoVentSpeedLevel');
      const hoodActive = ventSpeedLevel > 0 ? 1 : 0;
      if (this.serviceHood.getCharacteristic(this.platform.Characteristic.Active).value !== hoodActive) {
        this.serviceHood.updateCharacteristic(this.platform.Characteristic.Active, hoodActive);
      }

      if (this.serviceHood.getCharacteristic(this.platform.Characteristic.RotationSpeed).value !== ventSpeedLevel) {
        this.serviceHood.updateCharacteristic(this.platform.Characteristic.RotationSpeed, ventSpeedLevel);
      }



      ///////Timer Monitor

      const timerServiceUpdate = cookingTimerServiceUpdate(
        this.remainTime(),
        this.oventTargetTime(),
        this.onStatus(),
        Characteristic.InUse,
      );
      updateCharacteristicIfChanged(this.ovenTimerService, this.platform.Characteristic.Active, timerServiceUpdate.active);
      updateCharacteristicIfChanged(this.ovenTimerService, this.platform.Characteristic.InUse, timerServiceUpdate.inUse);
      updateCharacteristicIfChanged(this.ovenTimerService, this.platform.Characteristic.RemainingDuration, timerServiceUpdate.remainingDuration);
      updateCharacteristicIfChanged(this.ovenTimerService, this.platform.Characteristic.SetDuration, timerServiceUpdate.setDuration);

      const alarmServiceUpdate = cookingAlarmServiceUpdate(this.ovenTimerTime(), Characteristic.InUse);
      updateCharacteristicIfChanged(this.ovenAlarmService, Characteristic.Active, alarmServiceUpdate.active);
      updateCharacteristicIfChanged(this.ovenAlarmService, Characteristic.RemainingDuration, alarmServiceUpdate.remainingDuration);
      updateCharacteristicIfChanged(this.ovenAlarmService, Characteristic.InUse, alarmServiceUpdate.inUse);
    } else {
      if (this.firstPause) {
        setTimeout(() => {
          this.pauseUpdate = false;
          this.firstPause = true;
        }, 60000 * 2);
        this.firstPause = false;
      }
    }

  }

  update(snapshot: any) {
    super.update(snapshot);
    const oven = snapshot.oven;


    if (!oven) {
      return;
    }
  }

  public get Status() {
    return new MicrowaveStatus(this.accessory.context.device.snapshot?.ovenState, this.accessory.context.device.deviceModel);
  }

  public get config() {
    return Object.assign({}, {
      oven_trigger: false,
    }, super.config);
  }

}

export class MicrowaveStatus {
  constructor(public data: any, protected deviceModel: DeviceModel) { }

  getState(key: string) {
    return this.data[key + 'State'];
  }
}
