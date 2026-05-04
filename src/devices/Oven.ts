/**
 * Special thank to carlosgamezvillegas (https://github.com/carlosgamezvillegas) for the initial work on the Oven device.
 */
import { AccessoryContext, BaseDevice } from '../baseDevice.js';
import { LGThinQHomebridgePlatform } from '../platform.js';
import { Logger, Perms, PlatformAccessory, Service } from 'homebridge';
import { DeviceModel } from '../lib/DeviceModel.js';
import { Device } from '../lib/Device.js';
import { normalizeBoolean, normalizeNumber } from '../utils/normalize.js';
import {
  cooktopOperationDuration,
  cookingAlarmServiceUpdate,
  cookingStopCommand,
  cookingTimerServiceUpdate,
  durationFromSnapshot,
  hasActiveCookingState,
  hasCookingModeActive,
  hasNonZeroSnapshotNumber,
  homeKitTemperatureFromSnapshot,
  isCooktopActive,
  isEnabledStatus,
  isFahrenheitUnit,
  ovenRemoteStartCommand,
  ovenTimerCommand,
  prepareOvenCookCommand,
  temperatureDisplayUnitsValue,
} from './cooking.js';
import {
  snapshotNumber,
  snapshotString,
  updateCharacteristicIfChanged,
  visibilityCharacteristicUpdate,
} from './helpers.js';

enum OvenState {
  INITIAL = '@OV_STATE_INITIAL_W',
  PREHEATING = '@OV_STATE_PREHEAT_W',
  COOKING_IN_PROGRESS = '@OV_STATE_COOK_W',
  DONE = '@OV_STATE_COOK_COMPLETE_W',
  COOLING = '@OV_TERM_COOLING_W',
  CLEANING = '@OV_STATE_CLEAN_W',
  CLEANING_DONE = '@OV_STATE_CLEAN_COMPLETE_W',
}

/*
enum OvenMode {
  NONE = '@NONE',
  BAKE = '@OV_TERM_BAKE_W',
  ROAST = '@OV_TERM_ROAST_W',
  CONVECTION_BAKE = '@OV_TERM_CONV_BAKE_W',
  CONVECTION_ROAST = '@OV_TERM_CONV_ROAST_W',
  CRISP_CONVECTION = '@OV_TERM_CRISP_CONV_W',
  FAVORITE = '@OV_TERM_COOKMODE_FAVORITE_W',
  BROIL = '@OV_TERM_BROIL_W',
  WARM = '@OV_TERM_WARM_W',
  PROOF = '@OV_TERM_PROOF_W',
  FROZEN_MEAL = '@OV_TERM_FROZEN_MEAL_W',
  SLOW_COOK = '@OV_TERM_SLOW_COOK_W',
  PROBE_SET = '@OV_TERM_PROBE_SET_W',
  EASY_CLEAN = '@OV_TERM_EASY_CLEAN_W',
  SPEED_BROIL = '@OV_TERM_SPEED_BROIL_W',
  SELF_CLEAN = '@OV_TERM_SELF_CLEAN_W',
  SPEED_ROAST = '@OV_TERM_SPEED_ROAST_W',
  AIR_FRY = '@OV_TERM_AIR_FRY_W',
  PIZZA = '@OV_TERM_PIZZA_W',
  AIR_SOUSVIDE = '@OV_TERM_AIR_SOUSVIDE_W',
}
*/

export default class Oven extends BaseDevice {

  protected inputNameStatus = 'Oven Status';
  protected inputNameMode = 'Oven Mode';
  protected probeName = 'Oven Probe Status';
  protected inputNameTempString = 'Oven Temperature';
  protected courseStartString = 'Oven Start Time Not Set';
  protected courseTimeString = 'Oven Cook Time Not Set';
  protected courseTimerString = 'Oven Timer Not Set';
  protected courseTimeEndString = 'Oven End Time Not Set';
  protected inputNameOptions = 'Oven Options';
  protected inputNameBurner1 = 'Front Left Burner Status';
  protected inputNameBurner2 = 'Back Left Burner Status';
  protected inputNameBurner3 = 'Center Burner Status';
  protected inputNameBurner4 = 'Front Right Burner Status';
  protected inputNameBurner5 = 'Back Right Burner Status';
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
  protected localTemperature = 22;
  protected localHumidity = 50;
  protected ovenCommandList = {
    ovenMode: 'BAKE',
    ovenSetTemperature: 350,
    tempUnits: 'FAHRENHEIT',
    ovenSetDuration: 1800,
    probeTemperature: 0,
    ovenKeepWarm: 'DISABLE',
  };

  protected monitorOnly = true;
  protected homekitMonitorOnly = true;
  protected waitingForCommand = false;

  // flag
  protected showProbe = false;
  protected showTime = false;
  protected showTimer = false;
  protected showBurner1 = false;
  protected showBurner2 = false;
  protected showBurner3 = false;
  protected showBurner4 = false;
  protected showBurner5 = false;

  /** service */
  protected ovenService;
  protected ovenState;
  protected ovenMode;
  protected ovenTemp;
  protected prove;
  protected ovenOptions;
  protected ovenStart;
  protected ovenTimer;
  protected ovenTime;
  protected ovenEndTime;
  protected burner1;
  protected burner2;
  protected burner3;
  protected burner4;
  protected burner5;
  protected ovenTimerService;
  protected ovenAlarmService;
  protected bakeSwitch;
  protected convectionBakeSwitch;
  protected convectionRoastSwitch;
  protected frozenMealSwitch;
  protected airFrySwitch;
  protected airSousvideSwitch;
  protected warmModeSwitch;
  protected cancelSwitch;
  protected monitorOnlySwitch;
  protected startOvenSwitch;
  protected keepWarmSwitch;
  protected ovenDoorOpened;
  protected rangeOn;
  protected remoteEnabled;
  protected burnersOnNumber;
  protected ovenTempControl;
  protected probeTempControl;

  createInputSourceService(name: string, subtype: string, identifier: number, configuredName: string, isShow: boolean) {
    return this.accessory.getService(name) ||
      this.accessory.addService(this.platform.Service.InputSource, name, subtype)
        .setCharacteristic(this.platform.Characteristic.Identifier, identifier)
        .setCharacteristic(this.platform.Characteristic.ConfiguredName, configuredName)
        .setCharacteristic(this.platform.Characteristic.IsConfigured, this.platform.Characteristic.IsConfigured.CONFIGURED)
        .setCharacteristic(this.platform.Characteristic.InputSourceType, this.platform.Characteristic.InputSourceType.APPLICATION)
        .setCharacteristic(this.platform.Characteristic.TargetVisibilityState,
          isShow ? this.platform.Characteristic.TargetVisibilityState.SHOWN : this.platform.Characteristic.TargetVisibilityState.HIDDEN,
        )
        .setCharacteristic(this.platform.Characteristic.CurrentVisibilityState,
          isShow ? this.platform.Characteristic.CurrentVisibilityState.SHOWN : this.platform.Characteristic.CurrentVisibilityState.HIDDEN,
        );
  }

  constructor(
    public readonly platform: LGThinQHomebridgePlatform,
    public readonly accessory: PlatformAccessory<AccessoryContext>,
    logger: Logger,
  ) {
    super(platform, accessory, logger);

    const { Characteristic } = this.platform;

    this.ovenService = this.accessory.getService(this.config.name) ||
      this.accessory.addService(this.platform.Service.Television, this.config.name, 'NicoCataGaTa-OvenOven7');
    this.ovenService.setCharacteristic(this.platform.Characteristic.ConfiguredName, 'LG Range');
    this.ovenService.setPrimaryService(true);
    this.ovenService.setCharacteristic(this.platform
      .Characteristic.SleepDiscoveryMode, this.platform.Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);
    this.ovenService.getCharacteristic(this.platform.Characteristic.Active)
      .on('get', this.onlineGetCallback(() => this.ovenServiceActive()))
      .on('set', (value, callback) => {
        const enabled = normalizeBoolean(value);
        if (!enabled) {
          this.stopOven();
        } else {
          this.sendOvenCommand();
        }
        callback(null);
      });
    this.ovenService
      .setCharacteristic(this.platform.Characteristic.ActiveIdentifier, this.inputID);
    this.ovenService.getCharacteristic(this.platform.Characteristic.ActiveIdentifier)
      .on('set', (inputIdentifier, callback) => {
        const vNum = normalizeNumber(inputIdentifier);
        if (vNum === null) {
          this.platform.log.error('ActiveIdentifier is not a number');
          callback();
          return;
        }
        if (vNum > 14 || vNum < 1) {
          this.inputID = 1;
        } else {
          this.inputID = vNum;
        }
        callback();
      })
      .on('get', (callback) => {
        const currentValue = this.inputID;
        callback(null, currentValue);
      });

    this.ovenState = this.createInputSourceService('Oven Status', 'NicoCataGaTa-Oven1003', 1, this.ovenStatus(), true);
    this.ovenState.getCharacteristic(this.platform.Characteristic.ConfiguredName)
      .on('get', (callback) => {
        const currentValue = this.ovenStatus();
        callback(null, currentValue);
      });
    this.ovenService.addLinkedService(this.ovenState);

    this.ovenMode = this.createInputSourceService('Oven Mode', 'NicoCataGaTa-Oven1004', 2, this.ovenModeName(), this.ovenOnStatus());
    this.ovenMode.getCharacteristic(this.platform.Characteristic.ConfiguredName)
      .on('get', (callback) => {
        const currentValue = this.ovenModeName();
        callback(null, currentValue);
      });
    this.ovenService.addLinkedService(this.ovenMode);

    this.ovenTemp = this.createInputSourceService('Oven Temperature', 'NicoCataGaTa-Oven1004T', 3, this.ovenTemperature(), this.ovenOnStatus());
    this.ovenTemp.getCharacteristic(this.platform.Characteristic.ConfiguredName)
      .on('get', (callback) => {
        const currentValue = this.ovenTemperature();
        callback(null, currentValue);
      });
    this.ovenService.addLinkedService(this.ovenTemp);

    this.prove = this.createInputSourceService('Probe Status', 'NicoCata-Always15', 4, this.proveStatus(), this.showProbe);
    this.prove.getCharacteristic(this.platform.Characteristic.ConfiguredName)
      .on('get', (callback) => {
        const currentValue = this.proveStatus();
        callback(null, currentValue);
      });
    this.ovenService.addLinkedService(this.prove);

    this.ovenOptions = this.createInputSourceService('Oven Options', 'NicoCata-Always4', 5, this.oventOptions(), this.ovenOnStatus());
    this.ovenOptions.getCharacteristic(this.platform.Characteristic.ConfiguredName)
      .on('get', (callback) => {
        const currentValue = this.oventOptions();
        callback(null, currentValue);
      });
    this.ovenService.addLinkedService(this.ovenOptions);

    this.ovenStart = this.createInputSourceService('Oven Start Time', 'NicoCata-Always1', 6, this.courseStartString, this.showTime);
    this.ovenStart.getCharacteristic(this.platform.Characteristic.ConfiguredName)
      .on('get', (callback) => {
        const currentValue = this.courseStartString;
        callback(null, currentValue);
      });
    this.ovenService.addLinkedService(this.ovenStart);

    this.ovenTimer = this.createInputSourceService('Oven Timer Status', 'NicoCata-Always2', 7, this.courseTimerString, this.showTimer);
    this.ovenTimer.getCharacteristic(this.platform.Characteristic.ConfiguredName)
      .on('get', (callback) => {
        const currentValue = this.courseTimerString;
        callback(null, currentValue);
      });
    this.ovenService.addLinkedService(this.ovenTimer);

    this.ovenTime = this.createInputSourceService('Oven Cook Time Status', 'NicoCata-Always2T', 8, this.courseTimeString, this.showTime);
    this.ovenTime.getCharacteristic(this.platform.Characteristic.ConfiguredName)
      .on('get', (callback) => {
        const currentValue = this.courseTimeString;
        callback(null, currentValue);
      });
    this.ovenService.addLinkedService(this.ovenTime);

    this.ovenEndTime = this.createInputSourceService('Oven End Time', 'NicoCata-Always3', 9, this.courseTimeEndString, this.showTime);
    this.ovenEndTime.getCharacteristic(this.platform.Characteristic.ConfiguredName)
      .on('get', (callback) => {
        const currentValue = this.courseTimeEndString;
        callback(null, currentValue);
      });
    this.ovenService.addLinkedService(this.ovenEndTime);

    this.burner1 = this.createInputSourceService('Front Left Burner Status', 'NicoCataGaTa-Oven001', 10, this.burner1State(), this.showBurner1);
    this.burner1.getCharacteristic(this.platform.Characteristic.ConfiguredName)
      .on('get', (callback) => {
        const currentValue = this.burner1State();
        callback(null, currentValue);
      });
    this.ovenService.addLinkedService(this.burner1);

    this.burner2 = this.createInputSourceService('Back Left Burner Status', 'NicoCataGaTa-Oven002', 11, this.burner2State(), this.showBurner2);
    this.burner2.getCharacteristic(this.platform.Characteristic.ConfiguredName)
      .on('get', (callback) => {
        const currentValue = this.burner2State();
        callback(null, currentValue);
      });
    this.ovenService.addLinkedService(this.burner2);

    this.burner3 = this.createInputSourceService('Center Burner Status', 'NicoCataGaTa-Oven003', 12, this.burner3State(), this.showBurner3);
    this.burner3.getCharacteristic(this.platform.Characteristic.ConfiguredName)
      .on('get', (callback) => {
        const currentValue = this.burner3State();
        callback(null, currentValue);
      });
    this.ovenService.addLinkedService(this.burner3);

    this.burner4 = this.createInputSourceService('Front Right Burner Status', 'NicoCataGaTa-Oven004', 13, this.burner4State(), this.showBurner4);
    this.burner4.getCharacteristic(this.platform.Characteristic.ConfiguredName)
      .on('get', (callback) => {
        const currentValue = this.burner4State();
        callback(null, currentValue);
      });
    this.ovenService.addLinkedService(this.burner4);

    this.burner5 = this.createInputSourceService('Back Right Burner Status', 'NicoCataGaTa-Oven005', 14, this.burner5State(), this.showBurner5);
    this.burner5.getCharacteristic(this.platform.Characteristic.ConfiguredName)
      .on('get', (callback) => {
        const currentValue = this.burner5State();
        callback(null, currentValue);
      });
    this.ovenService.addLinkedService(this.burner5);

    //////////Timers
    this.ovenTimerService = this.accessory.getService('Oven Cook Time') ||
      this.accessory.addService(this.platform.Service.Valve, 'Oven Cook Time', 'NicoCataGaTa-OvenT2');
    this.ovenTimerService.setCharacteristic(Characteristic.Name, 'Oven Cook Time');
    this.ovenTimerService.addOptionalCharacteristic(this.platform.Characteristic.ConfiguredName);
    this.ovenTimerService.setCharacteristic(this.platform.Characteristic.ConfiguredName, 'Oven Cook Time');
    this.ovenTimerService.setCharacteristic(Characteristic.ValveType, Characteristic.ValveType.IRRIGATION);
    this.ovenTimerService.getCharacteristic(Characteristic.Active)
      .on('get', this.onlineGetCallback(() => this.remainTime() !== 0 ? 1 : 0))
      .on('set', (value, callback) => {
        const enabled = normalizeBoolean(value);
        if (!enabled) {
          this.stopOven();
          this.ovenTimerService.updateCharacteristic(Characteristic.Active, 0);
          this.ovenTimerService.updateCharacteristic(Characteristic.RemainingDuration, 0);
          this.ovenTimerService.updateCharacteristic(Characteristic.InUse, 0);
        } else {
          this.sendOvenCommand();
        }
        callback(null);
      });
    this.ovenTimerService.setCharacteristic(Characteristic.InUse, this.remainTime() > 0 ? Characteristic.InUse.IN_USE : Characteristic.InUse.NOT_IN_USE);
    this.ovenTimerService.getCharacteristic(Characteristic.RemainingDuration)
      .setProps({
        maxValue: (86400 / 2) - 1, // 12hours
      })
      .on('get', this.onlineGetCallback(() => this.remainTime()));
    this.ovenTimerService.getCharacteristic(this.platform.Characteristic.SetDuration)
      .setProps({
        maxValue: (86400 / 2) - 1, // 12hours
      })
      .on('get', this.onlineGetCallback(() => this.oventTargetTime()))
      .on('set', (value, callback) => {
        const vNum = normalizeNumber(value);
        if (vNum === null) {
          this.platform.log.error('SetDuration is not a number');
          callback();
          return;
        }
        this.pauseUpdate = true;
        this.platform.log.debug('Cooking Duration set to to: ' + this.secondsToTime(vNum));
        this.ovenCommandList.ovenSetDuration = vNum;
        callback(null);
      });
    this.ovenAlarmService = this.accessory.getService('Oven Timer') ||
      this.accessory.addService(this.platform.Service.Valve, 'Oven Timer', 'NicoCataGaTa-OvenT32');
    this.ovenAlarmService.addOptionalCharacteristic(this.platform.Characteristic.ConfiguredName);
    this.ovenAlarmService.setCharacteristic(this.platform.Characteristic.ConfiguredName, 'Oven Timer');
    this.ovenAlarmService.setCharacteristic(Characteristic.Name, 'Oven Timer');
    this.ovenAlarmService.setCharacteristic(Characteristic.ValveType, Characteristic.ValveType.IRRIGATION);
    this.ovenAlarmService.getCharacteristic(Characteristic.Active)
      .on('get', this.onlineGetCallback(() => this.ovenTimerTime() !== 0 ? 1 : 0))
      .on('set', (value, callback) => {
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
        callback(null);
      });
    this.ovenAlarmService.setCharacteristic(Characteristic.InUse, this.ovenTimerTime() > 0 ? Characteristic.InUse.IN_USE : Characteristic.InUse.NOT_IN_USE);
    this.ovenAlarmService.getCharacteristic(Characteristic.RemainingDuration)
      .setProps({
        maxValue: (86400 / 2), // 12hours
      })
      .on('get', this.onlineGetCallback(() => this.ovenTimerTime()));
    this.ovenAlarmService.getCharacteristic(this.platform.Characteristic.SetDuration)
      .setProps({
        maxValue: (86400 / 2), // 12hours
      })
      .on('get', this.onlineGetCallback(() => this.timerAlarmSec))
      .on('set', (value, callback) => {
        let vNum = normalizeNumber(value);
        if (vNum === null) {
          this.platform.log.error('SetDuration is not a number');
          callback();
          return;
        }
        if (vNum >= (86400 / 2)) {
          vNum = (86400 / 2) - 1;
        }
        this.timerAlarmSec = vNum;
        callback(null);
      });
    ////////////Buttons
    this.bakeSwitch = accessory.getService('Bake Mode') ||
      accessory.addService(this.platform.Service.Switch, 'Bake Mode', 'CataNicoGaTa-80');
    this.bakeSwitch.addOptionalCharacteristic(this.platform.Characteristic.ConfiguredName);
    this.bakeSwitch.setCharacteristic(this.platform.Characteristic.ConfiguredName, 'Bake Mode');
    this.bakeSwitch.getCharacteristic(this.platform.Characteristic.On)
      .on('get', (callback) => {
        this.platform.log.debug('Bake Switch Get state');
        const currentValue = false;
        callback(null, currentValue);
      })
      .on('set', (value, callback) => {
        if (value) {
          this.ovenCommandList.ovenMode = 'BAKE';
        }
        this.updateOvenModeSwitch();
        callback(null);
      });

    this.convectionBakeSwitch = accessory.getService('Convection Bake Mode') ||
      accessory.addService(this.platform.Service.Switch, 'Convection Bake Mode', 'CataNicoGaTa-Control1');
    this.convectionBakeSwitch.addOptionalCharacteristic(this.platform.Characteristic.ConfiguredName);
    this.convectionBakeSwitch.setCharacteristic(this.platform.Characteristic.ConfiguredName, 'Convection Bake Mode');
    this.convectionBakeSwitch.getCharacteristic(this.platform.Characteristic.On)
      .on('get', (callback) => {
        const currentValue = false;
        callback(null, currentValue);
      })
      .on('set', (value, callback) => {
        const enabled = normalizeBoolean(value);
        if (enabled) {
          this.ovenCommandList.ovenMode = 'CONVECTION_BAKE';
        }
        this.updateOvenModeSwitch();
        callback(null);
      });

    this.convectionRoastSwitch = accessory.getService('Convection Roast Mode') ||
      accessory.addService(this.platform.Service.Switch, 'Convection Roast Mode', 'CataNicoGaTa-Control2');
    this.convectionRoastSwitch.addOptionalCharacteristic(this.platform.Characteristic.ConfiguredName);
    this.convectionRoastSwitch.setCharacteristic(this.platform.Characteristic.ConfiguredName, 'Convection Roast Mode');
    this.convectionRoastSwitch.getCharacteristic(this.platform.Characteristic.On)
      .on('get', (callback) => {
        const currentValue = false;
        callback(null, currentValue);
      })
      .on('set', (value, callback) => {
        const enabled = normalizeBoolean(value);
        if (enabled) {
          this.ovenCommandList.ovenMode = 'CONVECTION_ROST';
        }
        this.updateOvenModeSwitch();
        callback(null);
      });

    this.frozenMealSwitch = accessory.getService('Frozen Meal Mode') ||
      accessory.addService(this.platform.Service.Switch, 'Frozen Meal Mode', 'CataNicoGaTa-Control3');
    this.frozenMealSwitch.addOptionalCharacteristic(this.platform.Characteristic.ConfiguredName);
    this.frozenMealSwitch.setCharacteristic(this.platform.Characteristic.ConfiguredName, 'Frozen Meal Mode');
    this.frozenMealSwitch.getCharacteristic(this.platform.Characteristic.On)
      .on('get', (callback) => {
        const currentValue = false;
        callback(null, currentValue);
      })
      .on('set', (value, callback) => {
        const enabled = normalizeBoolean(value);
        if (enabled) {
          this.ovenCommandList.ovenMode = 'FROZEN_MEAL';
        }
        this.updateOvenModeSwitch();
        callback(null);
      });
    this.airFrySwitch = accessory.getService('Air Fry Mode') ||
      accessory.addService(this.platform.Service.Switch, 'Air Fry Mode', 'CataNicoGaTa-Control4');
    this.airFrySwitch.addOptionalCharacteristic(this.platform.Characteristic.ConfiguredName);
    this.airFrySwitch.setCharacteristic(this.platform.Characteristic.ConfiguredName, 'Air Fry Mode');
    this.airFrySwitch.getCharacteristic(this.platform.Characteristic.On)
      .on('get', (callback) => {
        const currentValue = false;
        callback(null, currentValue);
      })
      .on('set', (value, callback) => {
        const enabled = normalizeBoolean(value);
        if (enabled) {
          this.ovenCommandList.ovenMode = 'AIR_FRY';
        }
        this.updateOvenModeSwitch();
        callback(null);
      });
    this.airSousvideSwitch = accessory.getService('Air Sousvide Mode') ||
      accessory.addService(this.platform.Service.Switch, 'Air Sousvide Mode', 'CataNicoGaTa-Control5');
    this.airSousvideSwitch.addOptionalCharacteristic(this.platform.Characteristic.ConfiguredName);
    this.airSousvideSwitch.setCharacteristic(this.platform.Characteristic.ConfiguredName, 'Air Sousvide Mode');
    this.airSousvideSwitch.getCharacteristic(this.platform.Characteristic.On)
      .on('get', (callback) => {
        const currentValue = false;
        callback(null, currentValue);
      })
      .on('set', (value, callback) => {
        const enabled = normalizeBoolean(value);
        if (enabled) {
          this.ovenCommandList.ovenMode = 'AIR_SOUSVIDE';
        }
        this.updateOvenModeSwitch();
        callback(null);
      });

    this.warmModeSwitch = accessory.getService('Proof-Warm Mode') ||
      accessory.addService(this.platform.Service.Switch, 'Proof-Warm Mode', 'CataNicoGaTa-Control5W');
    this.warmModeSwitch.addOptionalCharacteristic(this.platform.Characteristic.ConfiguredName);
    this.warmModeSwitch.setCharacteristic(this.platform.Characteristic.ConfiguredName, 'Proof-Warm Mode');
    this.warmModeSwitch.getCharacteristic(this.platform.Characteristic.On)
      .on('get', (callback) => {
        const currentValue = false;
        callback(null, currentValue);
      })
      .on('set', (value, callback) => {
        const enabled = normalizeBoolean(value);
        if (enabled) {
          this.ovenCommandList.ovenMode = 'WARM';
        }
        this.updateOvenModeSwitch();
        callback(null);
      });
    this.cancelSwitch = accessory.getService('Stop Oven') ||
      accessory.addService(this.platform.Service.Switch, 'Stop Oven', 'CataNicoGaTa-Control6');
    this.cancelSwitch.addOptionalCharacteristic(this.platform.Characteristic.ConfiguredName);
    this.cancelSwitch.setCharacteristic(this.platform.Characteristic.ConfiguredName, 'Stop Oven');
    this.cancelSwitch.getCharacteristic(this.platform.Characteristic.On)
      .on('get', (callback) => {
        const currentValue = false;
        callback(null, currentValue);
      })
      .on('set', (value, callback) => {
        const enabled = normalizeBoolean(value);
        if (enabled) {
          this.stopOven();
        }
        setTimeout(() => {
          this.cancelSwitch.updateCharacteristic(this.platform.Characteristic.On, false);
        }, 1000);
        this.updateOvenModeSwitch();
        callback(null);
      });

    this.monitorOnlySwitch = accessory.getService('Monitor Only Mode') ||
      accessory.addService(this.platform.Service.Switch, 'Monitor Only Mode', 'CataNicoGaTa-Control7');
    this.monitorOnlySwitch.addOptionalCharacteristic(this.platform.Characteristic.ConfiguredName);
    this.monitorOnlySwitch.setCharacteristic(this.platform.Characteristic.ConfiguredName, 'Monitor Only Mode');
    this.monitorOnlySwitch.getCharacteristic(this.platform.Characteristic.On)
      .on('get', (callback) => {
        if (!isEnabledStatus(this.Status.data, 'upperRemoteStart')) {
          this.monitorOnly = true;
        }
        const currentValue = this.monitorOnly;
        callback(null, currentValue);
      })
      .on('set', (value, callback) => {
        const b = normalizeBoolean(value);
        this.homekitMonitorOnly = b;
        this.monitorOnly = b;
        callback(null);
      });

    this.startOvenSwitch = accessory.getService('Start Oven') ||
      accessory.addService(this.platform.Service.Switch, 'Start Oven', 'CataNicoGaTa-Control8');
    this.startOvenSwitch.addOptionalCharacteristic(this.platform.Characteristic.ConfiguredName);
    this.startOvenSwitch.setCharacteristic(this.platform.Characteristic.ConfiguredName, 'Start Oven');
    this.startOvenSwitch.getCharacteristic(this.platform.Characteristic.On)
      .on('get', (callback) => {
        const currentValue = false;
        callback(null, currentValue);
      })
      .on('set', (value, callback) => {
        const enabled = normalizeBoolean(value);
        if (enabled) {
          this.sendOvenCommand();
          setTimeout(() => {
            this.startOvenSwitch.updateCharacteristic(this.platform.Characteristic.On, false);
          }, 1000);
        }
        callback(null);
      });

    if (snapshotString(this.Status.data, 'upperCookAndWarmStatus') !== '') {
      this.keepWarmSwitch = accessory.getService('Keep Warm') ||
        accessory.addService(this.platform.Service.Switch, 'Keep Warm', 'CataNicoGaTa-Control9');
      this.keepWarmSwitch.addOptionalCharacteristic(this.platform.Characteristic.ConfiguredName);
      this.keepWarmSwitch.setCharacteristic(this.platform.Characteristic.ConfiguredName, 'Keep Warm');
      this.keepWarmSwitch.getCharacteristic(this.platform.Characteristic.On)
        .on('get', (callback) => {
          const currentValue = isEnabledStatus(this.Status.data, 'upperCookAndWarmStatus');
          callback(null, currentValue);
        })
        .on('set', (value, callback) => {
          const enabled = normalizeBoolean(value);
          if (enabled) {
            this.ovenCommandList.ovenKeepWarm = 'ENABLE';
          } else {
            this.ovenCommandList.ovenKeepWarm = 'DISABLE';
          }
          callback(null);
        });
    }

    ////////Door sensor
    this.ovenDoorOpened = this.accessory.getService('Oven Door') ||
      this.accessory.addService(
        this.platform.Service.ContactSensor,
        'Oven Door',
        'NicoCataGaTa-OvenTCBCS',
      );
    this.ovenDoorOpened.addOptionalCharacteristic(this.platform.Characteristic.ConfiguredName);
    this.ovenDoorOpened.setCharacteristic(this.platform.Characteristic.ConfiguredName, 'Oven Door');
    this.ovenDoorOpened.setCharacteristic(this.platform.Characteristic.StatusActive, this.onStatus());
    this.ovenDoorOpened.setCharacteristic(
      this.platform.Characteristic.ContactSensorState,
      isEnabledStatus(this.Status.data, 'upperDoorOpen') ? 1 : 0,
    );

    ///Range Cooking
    this.rangeOn = this.accessory.getService('Range is Cooking') ||
      this.accessory.addService(
        this.platform.Service.MotionSensor,
        'Range is Cooking',
        'NicoCataGaTa-OvenTCBCSMotion',
      );
    this.rangeOn.addOptionalCharacteristic(this.platform.Characteristic.ConfiguredName);
    this.rangeOn.setCharacteristic(this.platform.Characteristic.ConfiguredName, 'Range is Cooking');
    this.rangeOn.setCharacteristic(this.platform.Characteristic.StatusActive, this.onStatus());
    this.rangeOn.setCharacteristic(this.platform.Characteristic.MotionDetected, this.onStatus());

    ////Remote Enabled
    this.remoteEnabled = this.accessory.getService('Remote Control Enabled') ||
      this.accessory.addService(
        this.platform.Service.ContactSensor,
        'Remote Control Enabled',
        'NicoCataGaTa-OvenTCRCS',
      );
    this.remoteEnabled.addOptionalCharacteristic(this.platform.Characteristic.ConfiguredName);
    this.remoteEnabled.setCharacteristic(this.platform.Characteristic.ConfiguredName, 'Remote Control Enabled');
    this.remoteEnabled.setCharacteristic(this.platform.Characteristic.StatusActive, this.onStatus());
    this.remoteEnabled.setCharacteristic(
      this.platform.Characteristic.ContactSensorState,
      isEnabledStatus(this.Status.data, 'upperRemoteStart') ? 1 : 0,
    );
    /////////Burners On

    this.burnersOnNumber = this.accessory.getService('Number of Burners in Use') ||
      this.accessory.addService(this.platform.Service.LightSensor, 'Number of Burners in Use', 'NicoCataGaTa-OvenTCB');
    this.burnersOnNumber.addOptionalCharacteristic(this.platform.Characteristic.ConfiguredName);
    this.burnersOnNumber.setCharacteristic(this.platform.Characteristic.ConfiguredName, 'Number of Burners in Use');
    const burnerOnCounter = snapshotNumber(this.Status.data, 'burnerOnCounter');
    this.burnersOnNumber.setCharacteristic(
      this.platform.Characteristic.CurrentAmbientLightLevel,
      burnerOnCounter < 1 ? 0.0001 : burnerOnCounter,
    );
    this.burnersOnNumber.setCharacteristic(this.platform.Characteristic.StatusActive, burnerOnCounter > 0 ? true : false);


    ///////Oven Temperature Control
    this.ovenTempControl = this.accessory.getService('Oven Temperature Control') ||
      this.accessory.addService(this.platform.Service.Thermostat, 'Oven Temperature Control', 'NicoCataGaTa-OvenTC')
        .setCharacteristic(this.platform.Characteristic.Name, 'Oven Temperature Control')
        .setCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState, this.currentHeatingState())
        .setCharacteristic(this.platform.Characteristic.TemperatureDisplayUnits, 1);
    this.ovenTempControl.addOptionalCharacteristic(this.platform.Characteristic.ConfiguredName);
    this.ovenTempControl.setCharacteristic(this.platform.Characteristic.ConfiguredName, 'Oven Temperature Control');
    this.ovenTempControl.getCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState)
      .on('get', this.onlineGetCallback(() => this.currentHeatingState()));
    this.ovenTempControl.getCharacteristic(this.platform.Characteristic.TemperatureDisplayUnits)
      .on('get', this.onlineGetCallback(() => temperatureDisplayUnitsValue(this.Status.data, 'upperCurrentTemperatureUnit')));
    this.ovenTempControl.getCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState)
      .setProps({ validValues: [this.platform.Characteristic.TargetHeatingCoolingState.OFF, this.platform.Characteristic.TargetHeatingCoolingState.HEAT] })
      .on('get', this.onlineGetCallback(() => this.targetHeatingState()))
      .on('set', (value, callback) => {
        const enabled = normalizeBoolean(value);
        if (!enabled) {
          this.stopOven();
        } else {
          this.pauseUpdate = true;
        }
        callback(null);
      });
    this.ovenTempControl.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
      .setProps({
        minValue: 0,
        maxValue: 218,
        minStep: 0.5,
      })
      .on('get', this.onlineGetCallback(() => this.ovenCurrentTemperature()));
    this.ovenTempControl.getCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity)
      .on('get', this.onlineGetCallback(() => this.localHumidity));
    this.ovenTempControl.getCharacteristic(this.platform.Characteristic.TargetTemperature)
      .setProps({
        minValue: 38,
        maxValue: 218,
        minStep: 0.5,
      })
      .on('get', this.onlineGetCallback(() => this.ovenTargetTemperature()))
      .on('set', (value, callback) => {
        const vNum = normalizeNumber(value);
        if (vNum === null) {
          this.platform.log.error('TargetTemperature is not a number');
          callback();
          return;
        }
        if (isFahrenheitUnit(this.Status.data, 'upperCurrentTemperatureUnit')) {
          this.ovenCommandList.ovenSetTemperature = this.tempCtoF(vNum);
        } else {
          this.ovenCommandList.ovenSetTemperature = Math.round(vNum);
        }
        callback(null);
      });

    this.probeTempControl = this.accessory.getService('Probe Temperature Control') ||
      this.accessory.addService(this.platform.Service.Thermostat, 'Probe Temperature Control', 'NicoCataGaTa-OvenTCP2')
        .setCharacteristic(this.platform.Characteristic.Name, 'Probe Temperature Control')
        .setCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState, this.probeCurrentState())
        .setCharacteristic(this.platform.Characteristic.TemperatureDisplayUnits, 1);
    this.probeTempControl.addOptionalCharacteristic(this.platform.Characteristic.ConfiguredName);
    this.probeTempControl.setCharacteristic(this.platform.Characteristic.ConfiguredName, 'Probe Temperature Control');
    this.probeTempControl.getCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState)
      .on('get', this.onlineGetCallback(() => this.probeCurrentState()));
    this.probeTempControl.getCharacteristic(this.platform.Characteristic.TemperatureDisplayUnits)
      .on('get', this.onlineGetCallback(() => temperatureDisplayUnitsValue(this.Status.data, 'upperCurrentTemperatureUnit')));
    this.probeTempControl.getCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState)
      .setProps({ validValues: [this.platform.Characteristic.TargetHeatingCoolingState.OFF, this.platform.Characteristic.TargetHeatingCoolingState.HEAT] })
      .on('get', this.onlineGetCallback(() => this.probeTargetState()))
      .on('set', (value, callback) => {
        this.pauseUpdate = true;
        callback(null);
      });
    this.probeTempControl.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
      .setProps({
        minValue: 0,
        maxValue: 285,
        minStep: 0.1,
      })
      .on('get', this.onlineGetCallback(() => this.probeCurrentTemperature()));
    this.probeTempControl.getCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity)
      .on('get', this.onlineGetCallback(() => this.localHumidity));
    this.probeTempControl.getCharacteristic(this.platform.Characteristic.TargetTemperature)
      .setProps({
        minValue: 38,
        maxValue: 285,
        minStep: 0.1,
      })
      .on('get', this.onlineGetCallback(() => this.probeTargetTemperature()))
      .on('set', (value, callback) => {
        const v = normalizeNumber(value);
        if (v === null) {
          this.platform.log.error('TargetTemperature is not a valid number');
          callback(null);
          return;
        }
        if (isFahrenheitUnit(this.Status.data, 'upperCurrentTemperatureUnit')) {
          this.ovenCommandList.probeTemperature = this.tempCtoF(v);
        } else {
          this.ovenCommandList.probeTemperature = Math.round(v);
        }
        callback(null);
      });
  }

  public get Status() {
    return new OvenStatus(this.accessory.context.device.snapshot?.ovenState, this.accessory.context.device.deviceModel);
  }

  get config() {
    return Object.assign({}, {
      oven_trigger: false,
    }, super.config);
  }

  secondsToTime(seconds: number) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor(seconds % 3600 / 60);
    const s = Math.floor(seconds % 60);
    return h + ':' + m + ':' + s + ' Hours';
  }

  async sendTimerCommand(time: number) {
    if (!this.isOnlineForHomeKit) {
      return;
    }

    if (!this.waitingForCommand) {
      this.platform.log.debug('Alarm Set to: ' + this.secondsToTime(time));
      const device = this.accessory.context.device;
      const timerCommand = ovenTimerCommand(time);
      await this.platform.ThinQ?.deviceControl(device.id, timerCommand.payload, timerCommand.command, timerCommand.ctrlKey);
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
        this.ovenCommandList.tempUnits = snapshotString(this.Status.data, 'upperCurrentTemperatureUnit', 'FAHRENHEIT');
        this.ovenCommandList = prepareOvenCookCommand(this.ovenCommandList);
        this.platform.log.debug('Sending the Folowing Commands: ' + JSON.stringify(this.ovenCommandList));
        const device = this.accessory.context.device;
        const ovenCommand = ovenRemoteStartCommand(this.ovenCommandList);
        await this.platform.ThinQ?.deviceControl(device.id, ovenCommand.payload, ovenCommand.command, ovenCommand.ctrlKey);

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
        this.platform.log.debug('Stop Command Sent to Oven');
        const device = this.accessory.context.device;
        const stopCommand = cookingStopCommand();
        await this.platform.ThinQ?.deviceControl(device.id, stopCommand.payload, stopCommand.command, stopCommand.ctrlKey);

        setTimeout(() => {
          this.pauseUpdate = false;
          this.firstPause = true;
        }, 10000);
        this.waitingForCommand = true;
        setTimeout(() => {
          this.waitingForCommand = false;
        }, 1000);
      }
    }
  }

  getMonitorState() {
    if (!isEnabledStatus(this.Status.data, 'upperRemoteStart')) {
      this.monitorOnly = true;
    } else {
      this.monitorOnly = this.homekitMonitorOnly as boolean;
    }
    return this.monitorOnly;
  }

  setActive() {
    this.platform.log.info('Oven Response 1', this.Status.data);
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

  ovenOnStatus() {
    return hasActiveCookingState(this.Status.data, 'upperState');
  }

  onStatus() {
    return this.ovenOnStatus() || hasNonZeroSnapshotNumber(this.Status.data, 'burnerOnCounter');
  }

  nameLengthCheck(newName: string) {
    if (newName.length >= 64) {
      newName = newName.slice(0, 60) + '...';
    }
    return newName;
  }

  remainTime() {
    return durationFromSnapshot(
      this.Status.data,
      'upperRemainTimeHour',
      'upperRemainTimeMinute',
      'upperRemainTimeSecond',
    );
  }

  ovenModeName() {
    this.inputNameMode = 'Oven Mode: ';
    switch (this.Status.data?.upperManualCookName) {
    case 'NONE':
      this.inputNameMode += 'None';
      break;
    case 'BAKE':
      this.inputNameMode += 'Bake';
      break;
    case 'ROAST':
      this.inputNameMode += 'Roast';
      break;
    case 'CONVECTION_BAKE':
      this.inputNameMode += 'Convection Bake';
      break;
    case 'CONVECTION_ROAST':
      this.inputNameMode += 'Convection Roast';
      break;
    case 'CRISP_CONVECTION':
      this.inputNameMode += 'Crisp Convection';
      break;
    case 'FAVORITE':
      this.inputNameMode += 'Favorite';
      break;
    case 'BROIL':
      this.inputNameMode += 'Broil';
      break;
    case 'WARM':
      this.inputNameMode += 'Warm';
      break;
    case 'PROOF':
      this.inputNameMode += 'Proof';
      break;
    case 'FROZEN_MEAL':
      this.inputNameMode += 'Frozen Meal';
      break;
    case 'SLOW_COOK':
      this.inputNameMode += 'Slow Cook';
      break;
    case 'PROBE_SET':
      this.inputNameMode += 'Probe Set';
      break;
    case 'EASY_CLEAN':
      this.inputNameMode += 'Easy Clean';
      break;
    case 'SPEED_BROIL':
      this.inputNameMode += 'Speed Broil';
      break;
    case 'SELF_CLEAN':
      this.inputNameMode += 'Self Clean';
      break;
    case 'SPEED_ROAST':
      this.inputNameMode += 'Speed Roast';
      break;
    case 'AIR_FRY':
      this.inputNameMode += 'Air Fry';
      break;
    case 'PIZZA':
      this.inputNameMode += 'Pizza';
      break;
    case 'AIR_SOUSVIDE':
      this.inputNameMode += 'Air Sousvide';
      break;
    default:
      // eslint-disable-next-line no-case-declarations
      let cookName = snapshotString(this.Status.data, 'upperManualCookName', 'unknown');
      cookName = cookName.toLocaleLowerCase();
      // eslint-disable-next-line no-case-declarations
      const cookNameCap =
          cookName.charAt(0).toUpperCase()
          + cookName.slice(1);

      this.inputNameMode += cookNameCap;

    }
    if (!this.inputNameMode.includes('None')) {
      this.inputNameMode = this.OvenSubCookMenu(this.inputNameMode);
    }

    if (isEnabledStatus(this.Status.data, 'upperCookAndWarmStatus')) {
      this.inputNameMode += ' (Keep Warm On)';
    }
    return this.nameLengthCheck(this.inputNameMode);
  }

  ovenStatus() {
    this.inputNameStatus = 'Oven is ';
    switch (this.Status.data?.upperState) {
    case 'INITIAL':
      this.inputNameStatus += 'in Standby';
      if (!isEnabledStatus(this.Status.data, 'upperRemoteStart')) {
        this.inputNameStatus += ' (Remote Start Disabled)';
      } else if (this.homekitMonitorOnly) {
        this.inputNameStatus += ' (Homekit Monitor Only Mode)';
      }
      break;
    case 'PREHEATING':
      this.inputNameStatus += 'Preheating';
      break;
    case 'COOKING_IN_PROGRESS':
      this.inputNameStatus += 'Baking';
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
    default:
      // eslint-disable-next-line no-case-declarations
      let stateName = snapshotString(this.Status.data, 'upperState', 'unknown');
      stateName = stateName.toLocaleLowerCase();
      // eslint-disable-next-line no-case-declarations
      const stateNameCap =
          stateName.charAt(0).toUpperCase()
          + stateName.slice(1);
      this.inputNameStatus += stateNameCap;

    }

    if (isEnabledStatus(this.Status.data, 'commonControlLock')) {
      this.inputNameStatus += ' - Controls Locked';
    }
    return this.nameLengthCheck(this.inputNameStatus);
  }

  ovenTemperature() {
    /////Current Temp
    let temperature = 'Oven Temperature Information';
    const currentTemperature = snapshotNumber(this.Status.data, 'upperCurrentTemperatureValue');
    if (currentTemperature !== 0) {
      temperature = 'Current Temp is ' + currentTemperature + '°';
    }

    ////Set temperature
    const targetTemperature = snapshotNumber(this.Status.data, 'upperTargetTemperatureValue');
    if (targetTemperature !== 0) {
      temperature += ' With Set Temp ' + targetTemperature + '°';
    }
    return this.nameLengthCheck(temperature);
  }

  ovenCurrentTemperature() {
    return homeKitTemperatureFromSnapshot(this.Status.data, 'upperCurrentTemperatureValue', 'upperCurrentTemperatureUnit')
      ?? homeKitTemperatureFromSnapshot(this.Status.data, 'upperTargetTemperatureValue', 'upperCurrentTemperatureUnit')
      ?? this.localTemperature;
  }

  ovenTargetTemperature() {
    return homeKitTemperatureFromSnapshot(this.Status.data, 'upperTargetTemperatureValue', 'upperCurrentTemperatureUnit') ?? 38;
  }

  probeCurrentTemperature() {
    /////Current Temp
    if (hasNonZeroSnapshotNumber(this.Status.data, 'upperCurrentProveTemperatureF')) {
      return this.tempFtoC(snapshotNumber(this.Status.data, 'upperCurrentProveTemperatureF'));
    } else {
      return this.localTemperature;
    }
  }

  probeTargetTemperature() {
    ////Set temperature
    if (hasNonZeroSnapshotNumber(this.Status.data, 'upperTargetProveTemperatureF')) {
      return this.tempFtoC(snapshotNumber(this.Status.data, 'upperTargetProveTemperatureF'));
    } else {
      return 38;
    }
  }

  OvenSubCookMenu(name: string) {
    const subCookMenu = snapshotString(this.Status.data, 'upperSubCookMenu');
    if (subCookMenu !== '' && subCookMenu !== 'NONE') {
      let subCook = subCookMenu;
      subCook = subCook.toLocaleLowerCase();
      const subCookCap =
        subCook.charAt(0).toUpperCase()
        + subCook.slice(1);
      return name + ' (' + subCookCap + ')';
    }
    return name;
  }

  oventTargetTime() {
    return durationFromSnapshot(
      this.Status.data,
      'upperTargetTimeHour',
      'upperTargetTimeMinute',
      'upperTargetTimeSecond',
    );
  }

  ovenTimerTime() {
    return durationFromSnapshot(
      this.Status.data,
      'upperTimerHour',
      'upperTimerMinute',
      'upperTimerSecond',
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
    if (isFahrenheitUnit(this.Status.data, 'upperCurrentTemperatureUnit')) {
      this.inputNameOptions += 'Temp in °F';
    } else {
      this.inputNameOptions += 'Temp in °C';
    }
    if (isEnabledStatus(this.Status.data, 'upperSabbath')) {
      this.inputNameOptions += ', Sabbath On';
    }
    if (snapshotString(this.Status.data, 'settingConvAutoConversion').includes('ENA')) {
      this.inputNameOptions += ', Auto Conversion';
    }
    if (snapshotString(this.Status.data, 'settingPreheatAlarm').includes('ON')) {
      this.inputNameOptions += ', Preheat Alarm°';
    }
    return this.nameLengthCheck(this.inputNameOptions);
  }

  ///////////
  proveStatus() {
    const currentProbeTemperature = snapshotNumber(this.Status.data, 'upperCurrentProveTemperatureF');
    const targetProbeTemperature = snapshotNumber(this.Status.data, 'upperTargetProveTemperatureF');
    if (currentProbeTemperature !== 0) {
      this.probeName = '';
      this.showProbe = true;
      if (targetProbeTemperature !== 0) {
        const donePercent = Math.round(100 * currentProbeTemperature / targetProbeTemperature);
        this.probeName += 'Food is ' + donePercent + '% Done, ';
      }
      if (isFahrenheitUnit(this.Status.data, 'upperCurrentTemperatureUnit')) {
        this.probeName += 'Current Probe Temp ' + currentProbeTemperature + '°';
        if (targetProbeTemperature !== 0) {
          this.probeName += ' With Set Temp ' + targetProbeTemperature + '°';
        }
      } else {
        this.probeName += 'Current Probe Temp ' + this.tempFtoC(currentProbeTemperature) + '°';
        if (targetProbeTemperature !== 0) {
          this.probeName += ' With Set Temp ' + this.tempFtoC(targetProbeTemperature) + '°';
        }

      }
    } else {
      this.probeName = 'Probe Settings Not Available ';
      this.showProbe = false;
    }
    return this.nameLengthCheck(this.probeName);
  }

  ///////////Temperature Control
  probeCurrentState() {
    /////Current Temp
    if (hasNonZeroSnapshotNumber(this.Status.data, 'upperCurrentProveTemperatureF')) {
      return 1;
    } else {
      return 0;
    }
  }

  probeTargetState() {
    ////Set temperature
    if (hasNonZeroSnapshotNumber(this.Status.data, 'upperTargetProveTemperatureF')) {
      return 1;
    } else {
      return 0;
    }
  }

  currentHeatingState() {
    if (hasNonZeroSnapshotNumber(this.Status.data, 'upperCurrentTemperatureValue')) {
      return 1;
    } else {
      return 0;
    }
  }

  targetHeatingState() {
    // if (this.Status.data?.upperState.includes('INITIAL') ||
    // this.Status.data?.upperState.includes('DONE') ||
    // this.Status.data?.upperState.includes('COOLING')) {
    if (!hasNonZeroSnapshotNumber(this.Status.data, 'upperTargetTemperatureValue')) {

      return 0;

    } else {
      return 1;
    }

  }

  createCook(key: string) {
    const { Service: { HeaterCooler }, Characteristic } = this.platform;
    const device = this.accessory.context.device;
    const service = this.accessory.getService(HeaterCooler) || this.accessory.addService(HeaterCooler, device.name);
    service.getCharacteristic(Characteristic.CurrentHeaterCoolerState)
      .onGet(this.onlineGet(() => {
        const currentState = device.deviceModel.lookupMonitorValue('UpperOvenState', this.Status.getState(key));
        if (currentState === null) {
          this.platform.log.error('Current Oven State is null');
          return Characteristic.CurrentHeaterCoolerState.INACTIVE;
        }
        if (currentState === OvenState.COOLING) {
          return Characteristic.CurrentHeaterCoolerState.COOLING;
        } else if ([OvenState.PREHEATING, OvenState.COOKING_IN_PROGRESS].includes(currentState as OvenState)) {
          return Characteristic.CurrentHeaterCoolerState.HEATING;
        } else {
          return Characteristic.CurrentHeaterCoolerState.IDLE;
        }
      }));
    service.getCharacteristic(Characteristic.TargetHeaterCoolerState)
      .setProps({
        validValues: [Characteristic.TargetHeaterCoolerState.HEAT],
        perms: [Perms.NOTIFY, Perms.PAIRED_READ],
      });
  }

  private cooktopBurnerState(cooktopNumber: number, label: string): { active: boolean; name: string } {
    if (!isCooktopActive(this.Status.data, cooktopNumber)) {
      return { active: false, name: label + ' Not in Use' };
    }

    const burnerOperationTime = cooktopOperationDuration(this.Status.data, cooktopNumber);
    if (burnerOperationTime !== 0) {
      return { active: true, name: label + ' is On. Cooking for ' + this.getOperationTime(burnerOperationTime) };
    }

    return { active: true, name: label + ' is On' };
  }

  burner1State() {
    const burnerState = this.cooktopBurnerState(1, 'Front Left Burner');
    this.inputNameBurner1 = burnerState.name;
    this.showBurner1 = burnerState.active;
    return this.nameLengthCheck(this.inputNameBurner1);
  }

  burner2State() {
    const burnerState = this.cooktopBurnerState(2, 'Back Left Burner');
    this.inputNameBurner2 = burnerState.name;
    this.showBurner2 = burnerState.active;
    return this.nameLengthCheck(this.inputNameBurner2);
  }

  burner3State() {
    const burnerState = this.cooktopBurnerState(3, 'Center Burner');
    this.inputNameBurner3 = burnerState.name;
    this.showBurner3 = burnerState.active;
    return this.nameLengthCheck(this.inputNameBurner3);
  }

  burner4State() {
    const burnerState = this.cooktopBurnerState(4, 'Front Right Burner');
    this.inputNameBurner4 = burnerState.name;
    this.showBurner4 = burnerState.active;
    return this.nameLengthCheck(this.inputNameBurner4);
  }

  burner5State() {
    const burnerState = this.cooktopBurnerState(5, 'Back Right Burner');
    this.inputNameBurner5 = burnerState.name;
    this.showBurner5 = burnerState.active;
    return this.nameLengthCheck(this.inputNameBurner5);
  }

  updateOvenModeSwitch() {
    this.pauseUpdate = true;
    this.updateOvenModeSwitchNoPause();
  }

  updateOvenModeSwitchNoPause() {
    this.bakeSwitch.updateCharacteristic(
      this.platform.Characteristic.On,
      this.ovenCommandList.ovenMode === 'BAKE' ? true : false);
    this.convectionBakeSwitch.updateCharacteristic(
      this.platform.Characteristic.On,
      this.ovenCommandList.ovenMode === 'CONVECTION_BAKE' ? true : false);
    this.convectionRoastSwitch.updateCharacteristic(
      this.platform.Characteristic.On,
      this.ovenCommandList.ovenMode === 'CONVECTION_ROST' ? true : false);
    this.frozenMealSwitch.updateCharacteristic(
      this.platform.Characteristic.On,
      this.ovenCommandList.ovenMode === 'FROZEN_MEAL' ? true : false);
    this.airFrySwitch.updateCharacteristic(
      this.platform.Characteristic.On,
      this.ovenCommandList.ovenMode === 'AIR_FRY' ? true : false);
    this.airSousvideSwitch.updateCharacteristic(
      this.platform.Characteristic.On,
      this.ovenCommandList.ovenMode === 'AIR_SOUSVIDE' ? true : false);
    this.warmModeSwitch.updateCharacteristic(
      this.platform.Characteristic.On,
      this.ovenCommandList.ovenMode === 'WARM' ? true : false);
  }

  getOperationTime(timeInSeconds: number) {

    const newTime = new Date(0);
    newTime.setSeconds(timeInSeconds);
    let newTimeString = newTime.toTimeString();

    if (newTimeString.startsWith('0')) {
      newTimeString = newTimeString.substring(1);
    }
    let hourMinutes = 'Minutes';
    if (timeInSeconds > 3600) {
      hourMinutes = 'Hours';
    }
    if (timeInSeconds === 3600) {
      hourMinutes = 'Hour';

    }
    return newTimeString + ' ' + hourMinutes;
  }

  ovenServiceActive() {
    return this.onStatus() ? 1 : 0;
  }

  updateAccessoryCharacteristic(device: Device) {
    super.updateAccessoryCharacteristic(device);
    const { Characteristic } = this.platform;
    // this.platform.log('Update Accessorry received');

    if (!this.pauseUpdate) {

      if (this.ovenService.getCharacteristic(this.platform.Characteristic.Active).value !== this.ovenServiceActive()) {
        this.ovenService.updateCharacteristic(this.platform.Characteristic.Active, this.ovenServiceActive());
      }
      if (this.ovenOnStatus()) {
        this.ovenCommandList = {
          ovenMode: 'NONE',
          ovenSetTemperature: 350,
          tempUnits: 'FAHRENHEIT',
          ovenSetDuration: 1800,
          probeTemperature: 0,
          ovenKeepWarm: 'DISABLE',
        };
        if (this.bakeSwitch.getCharacteristic(this.platform.Characteristic.On).value === true ||
          this.convectionBakeSwitch.getCharacteristic(this.platform.Characteristic.On).value === true ||
          this.convectionRoastSwitch.getCharacteristic(this.platform.Characteristic.On).value === true ||
          this.frozenMealSwitch.getCharacteristic(this.platform.Characteristic.On).value === true ||
          this.airFrySwitch.getCharacteristic(this.platform.Characteristic.On).value === true ||
          this.airSousvideSwitch.getCharacteristic(this.platform.Characteristic.On).value === true ||
          this.warmModeSwitch.getCharacteristic(this.platform.Characteristic.On).value === true) {
          this.updateOvenModeSwitch();
        }
      } else {
        this.ovenCommandList = {
          ovenMode: snapshotString(this.Status.data, 'upperManualCookName', 'NONE'),
          ovenSetTemperature: snapshotNumber(this.Status.data, 'upperTargetTemperatureValue'),
          tempUnits: snapshotString(this.Status.data, 'upperCurrentTemperatureUnit', 'FAHRENHEIT'),
          ovenSetDuration: this.oventTargetTime(),
          probeTemperature: snapshotNumber(this.Status.data, 'upperTargetProveTemperatureF'),
          ovenKeepWarm: isEnabledStatus(this.Status.data, 'upperCookAndWarmStatus') ? 'ENABLE' : 'DISABLE',
        };
        this.updateOvenModeSwitchNoPause();
      }

      ///// how to handle the time Here
      if (hasCookingModeActive(this.Status.data, 'upperManualCookName', 'NONE')) {
        if (this.firstStart) {
          this.courseStartString = this.ovenCookingStartTime();
        }
        this.showTime = true;
      } else {
        this.firstStart = true;
        this.showTime = false;
        this.courseStartString = 'Oven Start Time Not Set';
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
        this.courseTimeString = 'Oven Cook Time Not Set';
        this.courseTimeEndString = 'Oven End Time Not Set';
      }
      if (this.ovenTimerTime() !== 0) {
        if (this.ovenTimerTime() !== this.firstDuration) {
          this.firstTimer = this.ovenTimerTime();
          this.courseTimerString = this.ovenCookingTimer();
        }
        this.showTimer = true;
      } else {
        this.firstTimer = 0;
        this.showTimer = false;
        this.courseTimerString = 'Oven Timer Not Set';
      }


      ///////////////////

      if (this.ovenState.getCharacteristic(this.platform.Characteristic.ConfiguredName).value !== this.ovenStatus()) {
        this.ovenState.updateCharacteristic(this.platform.Characteristic.ConfiguredName, this.ovenStatus());
      }
      if (this.ovenMode.getCharacteristic(this.platform.Characteristic.ConfiguredName).value !== this.ovenModeName()) {
        this.ovenMode.updateCharacteristic(this.platform.Characteristic.ConfiguredName, this.ovenModeName());
      }
      if (this.prove.getCharacteristic(this.platform.Characteristic.ConfiguredName).value !== this.proveStatus()) {
        this.prove.updateCharacteristic(this.platform.Characteristic.ConfiguredName, this.proveStatus());
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
      if (this.burner1.getCharacteristic(this.platform.Characteristic.ConfiguredName).value !== this.burner1State()) {
        this.burner1.updateCharacteristic(this.platform.Characteristic.ConfiguredName, this.burner1State());
      }
      if (this.burner2.getCharacteristic(this.platform.Characteristic.ConfiguredName).value !== this.burner2State()) {
        this.burner2.updateCharacteristic(this.platform.Characteristic.ConfiguredName, this.burner2State());
      }
      if (this.burner3.getCharacteristic(this.platform.Characteristic.ConfiguredName).value !== this.burner3State()) {
        this.burner3.updateCharacteristic(this.platform.Characteristic.ConfiguredName, this.burner3State());
      }
      if (this.burner4.getCharacteristic(this.platform.Characteristic.ConfiguredName).value !== this.burner4State()) {
        this.burner4.updateCharacteristic(this.platform.Characteristic.ConfiguredName, this.burner4State());
      }
      if (this.burner5.getCharacteristic(this.platform.Characteristic.ConfiguredName).value !== this.burner5State()) {
        this.burner5.updateCharacteristic(this.platform.Characteristic.ConfiguredName, this.burner5State());
      }

      /////////////Show State
      const visibilityState = this.platform.Characteristic.TargetVisibilityState;
      const currentState = this.platform.Characteristic.CurrentVisibilityState;

      const updateVisibility = (service: Service, condition: boolean) => {
        const visibility = visibilityCharacteristicUpdate(condition, visibilityState, currentState);
        updateCharacteristicIfChanged(service, visibilityState, visibility.targetVisibilityState);
        updateCharacteristicIfChanged(service, currentState, visibility.currentVisibilityState);
      };

      updateVisibility(this.ovenMode, this.ovenOnStatus());
      updateVisibility(this.ovenTemp, this.ovenOnStatus());
      updateVisibility(this.prove, this.showProbe);
      updateVisibility(this.ovenOptions, this.ovenOnStatus());
      updateVisibility(this.ovenStart, this.showTime);
      updateVisibility(this.ovenTime, this.showTime);
      updateVisibility(this.ovenEndTime, this.showTime);
      updateVisibility(this.ovenTimer, this.showTimer);
      updateVisibility(this.burner1, this.showBurner1);
      updateVisibility(this.burner2, this.showBurner2);
      updateVisibility(this.burner3, this.showBurner3);
      updateVisibility(this.burner4, this.showBurner4);
      updateVisibility(this.burner5, this.showBurner5);

      /////////Temperature Monitor
      const temperatureDisplayUnits = temperatureDisplayUnitsValue(this.Status.data, 'upperCurrentTemperatureUnit');
      if (this.ovenTempControl.getCharacteristic(this.platform.Characteristic.TemperatureDisplayUnits).value !== temperatureDisplayUnits) {
        this.ovenTempControl.updateCharacteristic(
          this.platform.Characteristic.TemperatureDisplayUnits,
          temperatureDisplayUnits);
        this.probeTempControl.updateCharacteristic(
          this.platform.Characteristic.TemperatureDisplayUnits,
          temperatureDisplayUnits);
      }
      if (this.ovenTempControl.getCharacteristic(this.platform.Characteristic.CurrentTemperature).value !== this.ovenCurrentTemperature()) {
        this.ovenTempControl.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, this.ovenCurrentTemperature());
      }
      if (hasNonZeroSnapshotNumber(this.Status.data, 'upperTargetTemperatureValue')) {
        if (this.ovenTempControl.getCharacteristic(this.platform.Characteristic.TargetTemperature).value !== this.ovenTargetTemperature()) {
          this.ovenTempControl.updateCharacteristic(this.platform.Characteristic.TargetTemperature, this.ovenTargetTemperature());
        }
      }
      if (this.ovenTempControl.getCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState).value !== this.targetHeatingState()) {
        this.ovenTempControl.updateCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState, this.targetHeatingState());
      }
      if (this.ovenTempControl.getCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState).value !== this.currentHeatingState()) {
        this.ovenTempControl.updateCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState, this.currentHeatingState());
      }
      if (this.ovenTempControl.getCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity).value !== this.localHumidity) {
        this.probeTempControl.updateCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, this.localHumidity);
        this.ovenTempControl.updateCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity, this.localHumidity);
      }
      if (hasNonZeroSnapshotNumber(this.Status.data, 'upperCurrentProveTemperatureF')) {
        if (this.probeTempControl.getCharacteristic(this.platform.Characteristic.CurrentTemperature).value !== this.probeCurrentTemperature()) {
          this.probeTempControl.updateCharacteristic(this.platform.Characteristic.CurrentTemperature, this.probeCurrentTemperature());
        }
      }
      if (hasNonZeroSnapshotNumber(this.Status.data, 'upperTargetProveTemperatureF')) {
        if (this.probeTempControl.getCharacteristic(this.platform.Characteristic.TargetTemperature).value !== this.probeTargetTemperature()) {
          this.probeTempControl.updateCharacteristic(this.platform.Characteristic.TargetTemperature, this.probeTargetTemperature());
        }
      }
      if (this.probeTempControl.getCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState).value !== this.probeTargetState()) {
        this.probeTempControl.updateCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState, this.probeTargetState());
      }
      if (this.probeTempControl.getCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState).value !== this.probeCurrentState()) {
        this.probeTempControl.updateCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState, this.probeCurrentState());
      }
      ///////Timer Monitor

      const timerServiceUpdate = cookingTimerServiceUpdate(
        this.remainTime(),
        this.oventTargetTime(),
        this.ovenOnStatus(),
        Characteristic.InUse,
      );
      updateCharacteristicIfChanged(this.ovenTimerService, this.platform.Characteristic.Active, timerServiceUpdate.active);
      updateCharacteristicIfChanged(this.ovenTimerService, this.platform.Characteristic.InUse, timerServiceUpdate.inUse);
      updateCharacteristicIfChanged(this.ovenTimerService, this.platform.Characteristic.RemainingDuration, timerServiceUpdate.remainingDuration);
      updateCharacteristicIfChanged(this.ovenTimerService, this.platform.Characteristic.SetDuration, timerServiceUpdate.setDuration);

      ///Monitor Switch Status
      if (!isEnabledStatus(this.Status.data, 'upperRemoteStart')) {
        this.monitorOnly = true;
      }
      if (this.monitorOnlySwitch.getCharacteristic(this.platform.Characteristic.On).value !== this.monitorOnly) {
        this.monitorOnlySwitch.updateCharacteristic(this.platform.Characteristic.On, this.monitorOnly);
      }
      ////////Door Status

      this.ovenDoorOpened.updateCharacteristic(this.platform.Characteristic.StatusActive, this.onStatus());
      this.ovenDoorOpened.updateCharacteristic(this.platform.Characteristic.ContactSensorState, isEnabledStatus(this.Status.data, 'upperDoorOpen') ? 1 : 0);
      ///Range Status
      if (this.rangeOn.getCharacteristic(this.platform.Characteristic.StatusActive).value !== this.onStatus()) {
        this.rangeOn.updateCharacteristic(this.platform.Characteristic.StatusActive, this.onStatus());
        this.rangeOn.updateCharacteristic(this.platform.Characteristic.MotionDetected, this.onStatus());
      }
      ////Remote Control Status
      this.remoteEnabled.updateCharacteristic(this.platform.Characteristic.StatusActive, this.onStatus());
      this.remoteEnabled.updateCharacteristic(this.platform.Characteristic.ContactSensorState, isEnabledStatus(this.Status.data, 'upperRemoteStart') ? 1 : 0);
      /////Burners on
      const burnerOnCounter = snapshotNumber(this.Status.data, 'burnerOnCounter');
      this.burnersOnNumber.updateCharacteristic(
        this.platform.Characteristic.CurrentAmbientLightLevel,
        burnerOnCounter < 1 ? 0.0001 : burnerOnCounter);
      this.burnersOnNumber.updateCharacteristic(this.platform.Characteristic.StatusActive, burnerOnCounter > 0 ? true : false);
      //////Alarm Timer
      const alarmServiceUpdate = cookingAlarmServiceUpdate(this.ovenTimerTime(), Characteristic.InUse);
      updateCharacteristicIfChanged(this.ovenAlarmService, Characteristic.Active, alarmServiceUpdate.active);
      updateCharacteristicIfChanged(this.ovenAlarmService, Characteristic.RemainingDuration, alarmServiceUpdate.remainingDuration);
      updateCharacteristicIfChanged(this.ovenAlarmService, Characteristic.InUse, alarmServiceUpdate.inUse);
      if (snapshotString(this.Status.data, 'upperCookAndWarmStatus') !== '') {
        ////Switch State
        this.keepWarmSwitch?.updateCharacteristic(this.platform.Characteristic.On, isEnabledStatus(this.Status.data, 'upperCookAndWarmStatus'));

        //////////Warm Status
        if (isEnabledStatus(this.Status.data, 'upperCookAndWarmStatus')) {
          this.ovenCommandList.ovenKeepWarm = 'ENABLE';
        } else {
          this.ovenCommandList.ovenKeepWarm = 'DISABLE';
        }
      }
    } else {
      if (this.firstPause) {
        this.firstPause = false;
        setTimeout(() => {
          this.pauseUpdate = false;
          this.firstPause = true;
        }, 60000 * 2);
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
}

export class OvenStatus {
  constructor(public data: any, protected deviceModel: DeviceModel) { }

  getState(key: string) {
    return this.data[key + 'State'];
  }
}
