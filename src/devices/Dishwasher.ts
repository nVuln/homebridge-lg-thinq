import { AccessoryContext, BaseDevice } from '../baseDevice.js';
import { LGThinQHomebridgePlatform } from '../platform.js';
import { Logger, PlatformAccessory, Service } from 'homebridge';
import { Device } from '../lib/Device.js';
import { DeviceModel } from '../lib/DeviceModel.js';
import { normalizeNumber } from '../utils/normalize.js';
import { NOT_RUNNING_STATUS, WasherDryerStatus } from './WasherDryer.js';
import {
  contactSensorStateValue,
  snapshotNumber,
  snapshotString,
  updateCharacteristicIfChanged,
} from './helpers.js';

const DEFAULT_DISHWASHER_STATUS_DATA: Record<string, any> = {
  state: 'OFF',
  process: 'NONE',
  door: 'CLOSE',
  course: '',
  currentDownloadCourse: '',
  extraDry: 'OFF',
  delayStart: 'OFF',
  energySaver: 'OFF',
  halfLoad: 'OFF',
  dualZone: 'OFF',
  highTemp: 'OFF',
  steam: 'OFF',
  extraRinse: 'OFF',
  nightDry: 'OFF',
  reserveTimeHour: 0,
  reserveTimeMinute: 0,
  initialTimeHour: 0,
  initialTimeMinute: 0,
  remainTimeHour: 0,
  remainTimeMinute: 0,
  rinseLevel: 'LEVEL_1',
  tclCount: 0,
};

const withDishwasherDefaults = (data: any) => {
  const normalized = {
    ...DEFAULT_DISHWASHER_STATUS_DATA,
    ...(data ?? {}),
  };

  for (const [key, value] of Object.entries(DEFAULT_DISHWASHER_STATUS_DATA)) {
    if (normalized[key] === undefined || normalized[key] === null) {
      normalized[key] = value;
    }
  }

  return normalized;
};

export type DishwasherModelLookup = Pick<DeviceModel, 'lookupMonitorName'>;

export type DishwasherState = {
  data: Record<string, any>;
  isPowerOn: boolean;
  isRunning: boolean;
  isDoorClosed: boolean;
  isStandby: boolean;
  isDelayReserved: boolean;
  remainDuration: number;
  initialDuration: number;
};

function dishwasherDuration(data: Record<string, any>, hourKey: string, minuteKey: string): number {
  return snapshotNumber(data, hourKey) * 3600 + snapshotNumber(data, minuteKey) * 60;
}

function legacyWasherDryerRemainDuration(data: Record<string, any>): number {
  const state = snapshotString(data, 'state', 'POWEROFF');
  const isLegacyPowerOn = !['POWEROFF', 'POWERFAIL'].includes(state);
  const isLegacyRunning = isLegacyPowerOn && !NOT_RUNNING_STATUS.includes(state);
  return isLegacyRunning ? dishwasherDuration(data, 'remainTimeHour', 'remainTimeMinute') : 0;
}

export function readDishwasherState(data: any, deviceModel: DishwasherModelLookup): DishwasherState {
  const normalized = withDishwasherDefaults(data);
  const state = snapshotString(normalized, 'state', 'OFF');
  const process = snapshotString(normalized, 'process', 'NONE');
  const runningState = deviceModel.lookupMonitorName('state', '@DW_STATE_RUNNING_W') ?? 'RUNNING';
  const closedState = deviceModel.lookupMonitorName('door', '@CP_OFF_EN_W') ?? 'CLOSE';
  const isPowerOn = !state.includes('OFF') && !state.includes('POWERFAIL') && !state.includes('POWEROFF');

  return {
    data: normalized,
    isPowerOn,
    isRunning: isPowerOn && state === runningState,
    isDoorClosed: snapshotString(normalized, 'door') === closedState,
    isStandby: state.includes('STAND'),
    isDelayReserved: snapshotString(normalized, 'delayStart') === 'ON' && process.includes('RESER'),
    remainDuration: legacyWasherDryerRemainDuration(normalized),
    initialDuration: dishwasherDuration(normalized, 'initialTimeHour', 'initialTimeMinute'),
  };
}

export default class Dishwasher extends BaseDevice {
  public isRunning = false;
  public inputID = 1;
  public rinseLevel = 'LEVEL_2';
  public inputName = 'Dishwasher Status';
  public inputNameOptions = 'Dishwasher Options';
  public inputNameRinse = 'Dishwasher Rinse Aid Level';
  public inputNameMachine = 'Dishwasher Cleanness Status';
  public courseStartString = 'Cycle Start Time Not Set';
  public courseTimeString = 'Cycle Duration Not Set';
  public courseTimeEndString = 'Cycle End Time Not Set';
  public showTime = false;
  public firstTime = true;
  public firstEnd = true;
  public settingDuration = 0;
  public dryCounter = 0;
  public delayTime = 0;
  public firstDelay = true;
  public firstStandby = true;
  public standbyTimetMS = 0;
  public finishedTime = 'Today';

  protected serviceDishwasher;
  protected serviceDoorOpened;
  protected serviceEventFinished: Service | undefined;
  protected tvService;
  protected dishwasherState;
  protected dishwasherOptions;
  protected startTime;
  protected courseDuration;
  protected endTime;
  protected dishwasherRinseLevel;
  protected dishwasherClaenness;

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

    const {
      Service: {
        Valve,
        ContactSensor,
        OccupancySensor,
      },
      Characteristic,
    } = this.platform;

    const device = accessory.context.device;

    this.tvService = this.accessory.getService(this.config.name) ||
      this.accessory.addService(this.platform.Service.Television, this.config.name, 'CataNicoGaTa-70');
    this.tvService.setCharacteristic(this.platform.Characteristic.ConfiguredName, 'LG Dishwasher');
    this.tvService.setPrimaryService(true);
    this.tvService.setCharacteristic(this.platform
      .Characteristic.SleepDiscoveryMode, this.platform.Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);
    this.tvService.getCharacteristic(this.platform.Characteristic.Active)
      .onSet(this.setActive.bind(this))
      .updateValue(this.platform.Characteristic.Active.INACTIVE)
      .onGet(this.onlineGet(() => {
        return this.onStatus() ? 1 : 0;
      }));
    this.tvService
      .setCharacteristic(this.platform.Characteristic.ActiveIdentifier, this.inputID);
    this.tvService
      .getCharacteristic(this.platform.Characteristic.ActiveIdentifier).onSet((inputIdentifier) => {
        const vNum = normalizeNumber(inputIdentifier);
        if (vNum === null) {
          this.platform.log.error('Dishwasher ActiveIdentifier is not a number');
          return;
        }
        if (vNum > 7 || vNum < 1) {
          this.inputID = 1;
        } else {
          this.inputID = vNum;
        }
      }).onGet(() => {
        const currentValue = this.inputID;
        return currentValue;
      });

    this.dishwasherState = this.createInputSourceService('Dishwasher Status', 'CataNicoGaTa-10030', 1, this.inputName, true);
    this.dishwasherState.getCharacteristic(this.platform.Characteristic.ConfiguredName).onGet(() => {
      this.currentInputName();
      const currentValue = this.inputName;
      return currentValue;
    });
    this.tvService.addLinkedService(this.dishwasherState);

    this.dishwasherOptions = this.createInputSourceService('Dishwasher Options', 'CataNicoGaTa-10040', 2, this.inputNameOptions, this.onStatus());
    this.dishwasherOptions.getCharacteristic(this.platform.Characteristic.ConfiguredName).onGet(() => {
      this.currentInputName();
      const currentValue = this.inputNameOptions;
      return currentValue;
    });
    this.tvService.addLinkedService(this.dishwasherOptions);

    this.startTime = this.createInputSourceService('Cycle Start Time', 'CataNico-Always10', 3, this.courseStartString, this.showTime);
    this.startTime.getCharacteristic(this.platform.Characteristic.ConfiguredName).onGet(() => {
      const currentValue = this.courseStartString;
      return currentValue;
    });
    this.tvService.addLinkedService(this.startTime);

    this.courseDuration = this.createInputSourceService('Cycle Duration', 'CataNico-Always20', 4, this.courseTimeString, this.showTime);
    this.courseDuration.getCharacteristic(this.platform.Characteristic.ConfiguredName).onGet(() => {
      const currentValue = this.courseTimeString;
      return currentValue;
    });
    this.tvService.addLinkedService(this.courseDuration);

    this.endTime = this.createInputSourceService('Cycle End Time', 'CataNico-Always30', 5, this.courseTimeEndString, this.showTime);
    this.endTime.getCharacteristic(this.platform.Characteristic.ConfiguredName).onGet(() => {
      const currentValue = this.courseTimeEndString;
      return currentValue;
    });
    this.tvService.addLinkedService(this.endTime);

    this.dishwasherRinseLevel = this.createInputSourceService('Dishwasher Rinse Aid Level', 'CataNicoGaTa-10050', 6, this.inputNameRinse, this.onStatus());
    this.dishwasherRinseLevel.getCharacteristic(this.platform.Characteristic.ConfiguredName).onGet(() => {
      this.updateRinseLevel();
      const currentValue = this.inputNameRinse;
      return currentValue;
    });
    this.tvService.addLinkedService(this.dishwasherRinseLevel);

    this.dishwasherClaenness = this.createInputSourceService('Dishwasher Cleanness Status', 'CataNicoGaTa-10060', 7, this.inputNameMachine, this.onStatus());
    this.dishwasherClaenness.getCharacteristic(this.platform.Characteristic.ConfiguredName).onGet(() => {
      this.updateRinseLevel();
      const currentValue = this.inputNameMachine;
      return currentValue;
    });
    this.tvService.addLinkedService(this.dishwasherClaenness);

    this.serviceDishwasher = accessory.getService(Valve) || accessory.addService(Valve, 'LG Dishwasher');
    this.serviceDishwasher.setCharacteristic(Characteristic.Name, device.name);
    this.serviceDishwasher.addOptionalCharacteristic(this.platform.Characteristic.ConfiguredName);
    this.serviceDishwasher.setCharacteristic(this.platform.Characteristic.ConfiguredName, device.name);
    this.serviceDishwasher.setCharacteristic(Characteristic.ValveType, Characteristic.ValveType.IRRIGATION);
    this.serviceDishwasher.getCharacteristic(Characteristic.Active)
      .onSet(this.setActive.bind(this))
      .updateValue(Characteristic.Active.INACTIVE)
      .onGet(this.onlineGet(() => this.timerStatus()));
    this.serviceDishwasher.setCharacteristic(Characteristic.InUse, Characteristic.InUse.NOT_IN_USE);
    this.serviceDishwasher.getCharacteristic(this.platform.Characteristic.StatusFault)
      .onGet(this.onlineGet(() => this.getRinseLevel()));
    this.serviceDishwasher.getCharacteristic(Characteristic.RemainingDuration).setProps({
      maxValue: 86400 / 4,
    });
    this.serviceDishwasher.getCharacteristic(this.platform.Characteristic.SetDuration)
      .onGet(this.onlineGet(() => this.settingDuration))
      .setProps({
        maxValue: 86400 / 4, // 1 day
      });

    // Door open state
    this.serviceDoorOpened = accessory.getService(ContactSensor) || accessory.addService(ContactSensor, 'Dishwasher Door');
    this.serviceDoorOpened.addOptionalCharacteristic(this.platform.Characteristic.ConfiguredName);
    this.serviceDoorOpened.setCharacteristic(this.platform.Characteristic.ConfiguredName, 'Dishwasher Door');
    this.serviceDoorOpened.getCharacteristic(this.platform.Characteristic.StatusActive)
      .onGet(this.onlineGet(() => this.onStatus()));
    this.serviceDoorOpened.getCharacteristic(this.platform.Characteristic.BatteryLevel)
      .onGet(this.onlineGet(() => this.getRinseLevelPercent()));
    this.serviceDoorOpened.getCharacteristic(this.platform.Characteristic.StatusLowBattery)
      .onGet(this.onlineGet(() => this.getRinseLevelStatus()));

    this.serviceEventFinished = accessory.getService(OccupancySensor);
    if (this.config.dishwasher_trigger as boolean) {
      this.serviceEventFinished = this.serviceEventFinished || accessory.addService(OccupancySensor, device.name + ' - Program Finished');

      this.serviceEventFinished.updateCharacteristic(Characteristic.OccupancyDetected, Characteristic.OccupancyDetected.OCCUPANCY_NOT_DETECTED);
    } else if (this.serviceEventFinished) {
      accessory.removeService(this.serviceEventFinished);
    }
  }

  currentInputName() {
    if (!this.Status.data.process.includes('RESERVED')) {
      this.firstDelay = true;
    }
    if (!this.Status.data.state.includes('STAND')) {
      this.standbyTimetMS = 0;
      this.firstStandby = true;
    }
    if (this.firstDelay) {
      if (this.Status.data.state.includes('OFF')) {
        this.inputName = 'Power Off';
        this.firstEnd = true;
        this.resetTimeSettings();
        this.settingDuration = 0;
        this.dryCounter = 0;
      } else if (this.Status.data.state.includes('STAND')) {
        this.firstEnd = true;
        this.resetTimeSettings();
        this.dryCounter = 0;
        if (!this.onStatus()) {
          this.inputName = 'Power Off';
        } else {
          this.inputName = 'In Standby';
          if (!this.Status.data.door.includes('OPEN')) {
            this.inputName += ' (Door Closed)';
          }
        }
        if (this.firstStandby) {
          const standbyTime = new Date();
          this.standbyTimetMS = standbyTime.getTime();
          this.firstStandby = false;
          setTimeout(() => {
            updateCharacteristicIfChanged(this.serviceDishwasher, this.platform.Characteristic.Active, this.timerStatus());
            updateCharacteristicIfChanged(this.tvService, this.platform.Characteristic.Active, this.onStatus() ? 1 : 0);
            updateCharacteristicIfChanged(this.serviceDoorOpened, this.platform.Characteristic.StatusActive, this.onStatus());
          }, 3610000 / 4);
        }

      } else if (this.Status.data.state.includes('INITIAL')) {
        this.inputName = 'Initializing';
        this.resetTimeSettings();
      } else if (this.Status.data.state.includes('RUNNING')) {
        if (this.Status.data.course.includes('AUTO')) {
          this.inputName = 'Running a Auto Cycle';
        } else if (this.Status.data.course.includes('HEAVY')) {
          this.inputName = 'Running a Heavy Cycle';
        } else if (this.Status.data.course.includes('DELICATE')) {
          this.inputName = 'Running a Delicate Cycle';
        } else if (this.Status.data.course.includes('TURBO')) {
          this.inputName = 'Running a Turbo Cycle';
        } else if (this.Status.data.course.includes('NORMAL')) {
          this.inputName = 'Running a Normal Cycle';
        } else if (this.Status.data.course.includes('RINSE')) {
          this.inputName = 'Running a Rinse Cycle';
        } else if (this.Status.data.course.includes('REFRESH')) {
          this.inputName = 'Running a Refresh Cycle';
        } else if (this.Status.data.course.includes('EXPRESS')) {
          this.inputName = 'Running a Express Cycle';
        } else if (this.Status.data.course.includes('CLEAN')) {
          this.inputName = 'Cleaning the Dishwasher';
        } else if (this.Status.data.course.includes('SHORT')) {
          this.inputName = 'Running a Short Cycle';
        } else if (this.Status.data.course.includes('DOWNLOAD')) {
          let downloadCourse = this.Status.data.currentDownloadCourse;
          downloadCourse = downloadCourse.toLocaleLowerCase();
          const downloadCourseCap =
            downloadCourse.charAt(0).toUpperCase()
            + downloadCourse.slice(1);
          this.inputName = 'Running a ' + downloadCourseCap + ' Cycle';
        } else if (this.Status.data.course.includes('QUICK')) {
          this.inputName = 'Running a Quick Cycle';
        } else if (this.Status.data.course.includes('STREAM')) {
          this.inputName = 'Ruuning a Stream Cycle';
        } else if (this.Status.data.course.includes('SPRAY')) {
          this.inputName = 'Running a Spray Cycle';
        } else if (this.Status.data.course.includes('ECO')) {
          this.inputName = 'Running an Eco Cycle';
        } else {
          let lowerCase = this.Status.data.course;
          lowerCase = lowerCase.toLocaleLowerCase();
          const upperCase =
            lowerCase.charAt(0).toUpperCase()
            + lowerCase.slice(1);
          this.inputName = 'Running a ' + upperCase + ' Cycle';
        }

      } else if (this.Status.data.state.includes('PAUSE')) {
        this.inputName = 'Paused Cleaning';
        this.firstTime = true;
        this.firstDelay = true;
      } else if (this.Status.data.state.includes('END')) {
        if (this.firstEnd) {
          const courseFinished = new Date();
          this.finishedTime = courseFinished.toLocaleString('en-US', {
            weekday: 'short',
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour12: false,
            hour: 'numeric',
            minute: 'numeric',
            second: 'numeric',
            timeZoneName: 'short',
          });
          this.firstEnd = false;
          this.resetTimeSettings();

        }
        this.inputName = 'Finished Cycle ' + this.finishedTime;
        if (this.Status.data.extraDry.includes('ON') && this.dryCounter > 3 && this.Status.remainDuration === 3600) {
          this.inputName += ' (Waiting For Extra Dry Step)';
        }
      } else if (this.Status.data.state.includes('FAIL')) {
        this.inputName = 'Failure Detected';
      } else if (this.Status.data.state.includes('RESERVED')) {
        this.inputName = 'Is Reserved';
      } else if (this.Status.data.state.includes('RINSING')) {
        this.inputName = 'Rinsing';
      } else if (this.Status.data.state.includes('DRYING')) {
        this.inputName = 'Drying';
      } else if (this.Status.data.state.includes('NIGHT')) {
        this.inputName = 'Night Drying';
      } else if (this.Status.data.state.includes('CANCEL')) {
        this.inputName = 'Cancelled Cleaning';
      } else if (this.Status.data.state.includes('ERROR')) {
        this.inputName = 'Cleaning Error';
      } else {
        let lowerCase = this.Status.data.state;
        lowerCase = lowerCase.toLocaleLowerCase();
        const upperCase =
          lowerCase.charAt(0).toUpperCase()
          + lowerCase.slice(1);
        this.inputName = 'Dishwasher ' + upperCase;
      }
      if (this.Status.data.door.includes('OPEN')) {
        this.inputName += ' (Door Open)';
        this.resetTimeSettings();
      }
      if (this.Status.data.state === this.Status.data.process && this.Status.data.process.includes('RUNNING')) {
        this.inputName += '. Step: Cleaning';
      }
      if (this.Status.data.state !== this.Status.data.process && !this.Status.data.process.includes('NONE') && !this.Status.data.state.includes('END')) {
        if (this.Status.data.process.includes('RINSING')) {
          this.inputName += '. Step: Rinsing';
        } else if (this.Status.data.process.includes('DRYING')) {
          this.inputName += '. Step: Drying';
          if (this.Status.data.extraDry.includes('ON') && this.dryCounter > 3) {
            this.inputName += ' (Extra)';
          }
        } else if (this.Status.data.process.includes('NIGHT')) {
          this.inputName += '. Step: Night Drying';
        } else if (this.Status.data.process.includes('END')) {
          this.inputName += '. Step: Ending';
        } else if (this.Status.data.process.includes('CANCEL')) {
          this.inputName += '. Step: Cancelling';
        } else if (this.Status.data.process.includes('RESERVED') && this.Status.data.delayStart === 'ON') {
          const courseTime = new Date(0);
          this.delayTime = this.Status.data.reserveTimeHour * 60 * 60 + this.Status.data.reserveTimeMinute * 60;
          courseTime.setSeconds(this.delayTime);
          let delayTimeString = courseTime.toISOString().substr(11, 8);

          if (delayTimeString.startsWith('0')) {
            delayTimeString = delayTimeString.substring(1);
          }
          let hourMinutes = 'Minutes';
          if (this.delayTime > 3600) {
            hourMinutes = 'Hours';
          }
          if (this.delayTime === 3600) {
            hourMinutes = 'Hour';

          }
          this.inputName += '. Step: Waiting ' + delayTimeString + ' ' + hourMinutes + ' to Start';
          this.timeDurationEnd();
          this.firstDelay = false;
        } else {
          if (!this.Status.data.state.includes('INITIAL') && !this.Status.data.state.includes('STAND') && !this.Status.data.process.includes('RESERVED')) {
            let lowerCase = this.Status.data.state;
            lowerCase = lowerCase.toLocaleLowerCase();
            const upperCase =
              lowerCase.charAt(0).toUpperCase()
              + lowerCase.slice(1);
            this.inputName += '. Step: ' + upperCase;
          }
        }
      }
    }
    this.inputNameOptions = 'Options:';
    if (this.Status.data.energySaver?.includes('ON')) {
      this.inputNameOptions += ' Energy Saver,';
    }
    if (this.Status.data.halfLoad?.includes('ON')) {
      this.inputNameOptions += ' Half Load,';
    }
    if (this.Status.data.dualZone?.includes('ON')) {
      this.inputNameOptions += ' Dual Zone,';
    }
    if (this.Status.data.highTemp?.includes('ON')) {
      this.inputNameOptions += ' High Temp,';
    }
    if (this.Status.data.steam?.includes('ON')) {
      this.inputNameOptions += ' Steam,';
    }
    if (this.Status.data.extraRinse?.includes('ON')) {
      this.inputNameOptions += ' Extra Rinse,';
    }
    if (this.Status.data.extraDry?.includes('ON')) {
      this.inputNameOptions += ' Extra Dry,';
    }
    if (this.Status.data.nightDry?.includes('ON')) {
      this.inputNameOptions += ' Night Dry,';
    }
    if (this.Status.data.delayStart?.includes('ON')) {
      this.inputNameOptions += ' Delay Start,';
    }
    if (!this.Status.data.energySaver?.includes('ON') &&
      !this.Status.data.halfLoad?.includes('ON') &&
      !this.Status.data.dualZone?.includes('ON') &&
      !this.Status.data.highTemp?.includes('ON') &&
      !this.Status.data.steam?.includes('ON') &&
      !this.Status.data.extraRinse?.includes('ON') &&
      !this.Status.data.extraDry?.includes('ON') &&
      !this.Status.data.nightDry?.includes('ON') &&
      !this.Status.data.delayStart?.includes('ON')) {
      this.inputNameOptions += ' None,';
    }
    this.inputNameOptions = this.inputNameOptions.substring(0, this.inputNameOptions.length - 1);
    ///Names length Check
    this.inputName = this.nameLengthCheck(this.inputName);
    this.inputNameOptions = this.nameLengthCheck(this.inputNameOptions);
    //////
    updateCharacteristicIfChanged(this.dishwasherState, this.platform.Characteristic.ConfiguredName, this.inputName);
    if (!this.Status.isPowerOn) {
      this.inputNameOptions = 'Dishwasher Options';
    }
    updateCharacteristicIfChanged(this.dishwasherOptions, this.platform.Characteristic.ConfiguredName, this.inputNameOptions);
    updateCharacteristicIfChanged(
      this.dishwasherOptions,
      this.platform.Characteristic.TargetVisibilityState,
      this.onStatus() ? this.platform.Characteristic.TargetVisibilityState.SHOWN : this.platform.Characteristic.TargetVisibilityState.HIDDEN);
    updateCharacteristicIfChanged(
      this.dishwasherOptions,
      this.platform.Characteristic.CurrentVisibilityState,
      this.onStatus() ? this.platform.Characteristic.CurrentVisibilityState.SHOWN : this.platform.Characteristic.CurrentVisibilityState.HIDDEN);
  }

  timeDurationEnd() {
    /////Cycle duration
    this.showTime = true;
    const courseTime = new Date(0);
    courseTime.setSeconds(this.Status.remainDuration);
    let courseTimeString = courseTime.toISOString().substr(11, 8);

    if (courseTimeString.startsWith('0')) {
      courseTimeString = courseTimeString.substring(1);
    }
    let hourMinutes = 'Minutes';
    if (this.Status.remainDuration > 3600) {
      hourMinutes = 'Hours';
    }
    if (this.Status.remainDuration === 3600) {
      hourMinutes = 'Hour';

    }
    this.courseTimeString = 'Duration: ' + courseTimeString + ' ' + hourMinutes;
    if (this.Status.data.extraDry.includes('ON')) {
      this.courseTimeString += ' + 1:00:00 Hour For Extra Dry';
    }
    ////Starting time
    const courseCurrentTime = new Date();
    const courseStartMS = courseCurrentTime.getTime();
    const courseStart = new Date(courseStartMS + this.delayTime * 1000);
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
    this.courseStartString = 'Start: ' + newDate;

    const dateEnd = new Date(this.Status.remainDuration * 1000 + courseStartMS + this.delayTime * 1000);
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
    this.courseTimeEndString = 'End: ' + newEndDate;
    ///Names length Check
    this.courseStartString = this.nameLengthCheck(this.courseStartString);
    this.courseTimeString = this.nameLengthCheck(this.courseTimeString);
    this.courseTimeEndString = this.nameLengthCheck(this.courseTimeEndString);
    //////
    updateCharacteristicIfChanged(this.startTime, this.platform.Characteristic.ConfiguredName, this.courseStartString);
    updateCharacteristicIfChanged(this.courseDuration, this.platform.Characteristic.ConfiguredName, this.courseTimeString);
    updateCharacteristicIfChanged(this.endTime, this.platform.Characteristic.ConfiguredName, this.courseTimeEndString);
    updateCharacteristicIfChanged(
      this.startTime,
      this.platform.Characteristic.TargetVisibilityState,
      this.showTime ? this.platform.Characteristic.TargetVisibilityState.SHOWN : this.platform.Characteristic.TargetVisibilityState.HIDDEN);
    updateCharacteristicIfChanged(
      this.startTime,
      this.platform.Characteristic.CurrentVisibilityState,
      this.showTime ? this.platform.Characteristic.CurrentVisibilityState.SHOWN : this.platform.Characteristic.CurrentVisibilityState.HIDDEN);
    updateCharacteristicIfChanged(
      this.courseDuration,
      this.platform.Characteristic.TargetVisibilityState,
      this.showTime ? this.platform.Characteristic.TargetVisibilityState.SHOWN : this.platform.Characteristic.TargetVisibilityState.HIDDEN);
    updateCharacteristicIfChanged(
      this.courseDuration,
      this.platform.Characteristic.CurrentVisibilityState,
      this.showTime ? this.platform.Characteristic.CurrentVisibilityState.SHOWN : this.platform.Characteristic.CurrentVisibilityState.HIDDEN);
    updateCharacteristicIfChanged(
      this.endTime,
      this.platform.Characteristic.TargetVisibilityState,
      this.showTime ? this.platform.Characteristic.TargetVisibilityState.SHOWN : this.platform.Characteristic.TargetVisibilityState.HIDDEN);
    updateCharacteristicIfChanged(
      this.endTime,
      this.platform.Characteristic.CurrentVisibilityState,
      this.showTime ? this.platform.Characteristic.CurrentVisibilityState.SHOWN : this.platform.Characteristic.CurrentVisibilityState.HIDDEN);
  }

  setActive() {
    this.requireDeviceOnline();
    this.platform.log.debug('Dishwasher Response', this.Status.data);

    // this.platform.log('Dishwasher rinse', this.Status.data.rinseLevel);
    //  this.platform.log('Dishwasher rinse typeof', typeof this.Status.data.rinseLevel);
    //this.updateRinseLevel();
    //  this.platform.log('Dishwasher rinse status', this.rinseStatus);
    // this.serviceDishwasher.updateCharacteristic(this.platform.Characteristic.StatusFault, this.rinseStatus);
    // this.platform.log('Dishwasher Response', this.Status);
    // throw new this.platform.api.hap.HapStatusError(-70412 /* this.platform.api.hap.HAPStatus.NOT_ALLOWED_IN_CURRENT_STATE */);
  }

  public updateAccessoryCharacteristic(device: Device) {
    super.updateAccessoryCharacteristic(device);
    const { Characteristic } = this.platform;
    const status = this.Status;

    if (status.remainDuration !== this.serviceDishwasher.getCharacteristic(Characteristic.RemainingDuration).value) {
      if (status.data.extraDry.includes('ON') && status.remainDuration === 3600) {
        this.dryCounter += 1;
      }
      if (this.dryCounter <= 3) {
        updateCharacteristicIfChanged(this.serviceDishwasher, Characteristic.RemainingDuration, status.remainDuration);
      }
    }
    if (status.isPowerOn) {
      this.settingDuration = status.initialDuration;
    }
    if (this.settingDuration !== this.serviceDishwasher.getCharacteristic(Characteristic.SetDuration).value) {
      updateCharacteristicIfChanged(this.serviceDishwasher, this.platform.Characteristic.SetDuration, this.settingDuration);
    }
    updateCharacteristicIfChanged(this.serviceDishwasher, Characteristic.Active, this.timerStatus());
    updateCharacteristicIfChanged(this.tvService, this.platform.Characteristic.Active, this.onStatus() ? 1 : 0);
    if (status.isDelayReserved) {
      updateCharacteristicIfChanged(this.serviceDishwasher, Characteristic.InUse, 0);

    } else if (status.isStandby) {
      updateCharacteristicIfChanged(this.serviceDishwasher, Characteristic.InUse, 0);
    } else {
      updateCharacteristicIfChanged(this.serviceDishwasher, Characteristic.InUse, status.isRunning ? 1 : 0);

    }
    if (this.serviceDoorOpened) {
      const contactSensorValue = contactSensorStateValue(status.isDoorClosed, Characteristic.ContactSensorState);
      updateCharacteristicIfChanged(this.serviceDoorOpened, Characteristic.ContactSensorState, contactSensorValue);
    }
    this.currentInputName();
    if (status.data.state.includes('RUNNING') && !status.data.process.includes('RESERVED') && this.firstTime) {
      this.delayTime = 0;
      this.timeDurationEnd();
      this.firstTime = false;
    }
    this.updateRinseLevel();
  }

  public get Status() {
    return new DishwasherStatus(this.accessory.context.device.snapshot?.dishwasher, this.accessory.context.device.deviceModel);
  }

  public get config() {
    return Object.assign({}, {
      dishwasher_trigger: false,
    }, super.config);
  }

  nameLengthCheck(newName: string) {
    if (newName.length >= 64) {
      newName = newName.slice(0, 60) + '...';
    }
    return newName;
  }

  updateRinseLevel() {
    if (this.Status.data.state.includes('RUNNING')) {
      this.rinseLevel = this.Status.data.rinseLevel || 'LEVEL_1';
    }
    let rinseLevelPercent = 100;
    let rinseLevelStatus = 0;
    if (this.rinseLevel === 'LEVEL_0') {
      rinseLevelPercent = 0;
      rinseLevelStatus = 1;
      this.inputNameRinse = 'Rinse Aid Level is Running Low';
      this.inputID = 3;
    } else if (this.rinseLevel === 'LEVEL_1') {
      rinseLevelPercent = 50;
      this.inputNameRinse = 'Rinse Aid Level is at 50% Capacity';
    } else if (this.rinseLevel === 'LEVEL_2') {
      rinseLevelPercent = 100;
      this.inputNameRinse = 'Rinse Aid Level is at 100% Capacity';
    } else {
      this.inputNameRinse = 'Rinse Aid Level is Normal';
    }
    updateCharacteristicIfChanged(this.serviceDishwasher, this.platform.Characteristic.StatusFault, rinseLevelStatus);
    updateCharacteristicIfChanged(this.serviceDoorOpened, this.platform.Characteristic.StatusActive, this.onStatus());
    updateCharacteristicIfChanged(this.serviceDoorOpened, this.platform.Characteristic.BatteryLevel, rinseLevelPercent);
    updateCharacteristicIfChanged(this.serviceDoorOpened, this.platform.Characteristic.StatusLowBattery, rinseLevelStatus);

    if (this.Status.data.tclCount > 30) {
      this.inputID = 7;
      this.inputNameMachine = 'Machine Cleaning Cycle is Needed Soon';
      updateCharacteristicIfChanged(this.dishwasherClaenness, this.platform.Characteristic.ConfiguredName, this.inputNameMachine);
      updateCharacteristicIfChanged(
        this.dishwasherClaenness,
        this.platform.Characteristic.TargetVisibilityState,
        this.onStatus() ? this.platform.Characteristic.TargetVisibilityState.SHOWN : this.platform.Characteristic.TargetVisibilityState.HIDDEN);
      updateCharacteristicIfChanged(
        this.dishwasherClaenness,
        this.platform.Characteristic.CurrentVisibilityState,
        this.onStatus() ? this.platform.Characteristic.CurrentVisibilityState.SHOWN : this.platform.Characteristic.CurrentVisibilityState.HIDDEN);

    } else {
      this.inputNameMachine = 'Dishwasher is Clean';
      updateCharacteristicIfChanged(this.dishwasherClaenness, this.platform.Characteristic.ConfiguredName, this.inputNameMachine);
      updateCharacteristicIfChanged(
        this.dishwasherClaenness,
        this.platform.Characteristic.TargetVisibilityState, this.platform.Characteristic.TargetVisibilityState.HIDDEN);
      updateCharacteristicIfChanged(
        this.dishwasherClaenness,
        this.platform.Characteristic.CurrentVisibilityState, this.platform.Characteristic.CurrentVisibilityState.HIDDEN);
    }
    updateCharacteristicIfChanged(this.dishwasherRinseLevel, this.platform.Characteristic.ConfiguredName, this.inputNameRinse);
    updateCharacteristicIfChanged(
      this.dishwasherRinseLevel,
      this.platform.Characteristic.TargetVisibilityState,
      this.onStatus() ? this.platform.Characteristic.TargetVisibilityState.SHOWN : this.platform.Characteristic.TargetVisibilityState.HIDDEN);
    updateCharacteristicIfChanged(
      this.dishwasherRinseLevel,
      this.platform.Characteristic.CurrentVisibilityState,
      this.onStatus() ? this.platform.Characteristic.CurrentVisibilityState.SHOWN : this.platform.Characteristic.CurrentVisibilityState.HIDDEN);
  }

  onStatus() {
    const newCurrentTime = new Date();
    const newCurrentTimeMS = newCurrentTime.getTime();
    if (this.standbyTimetMS !== 0) {
      if (newCurrentTimeMS - this.standbyTimetMS > 3600000 / 10) {
        return false;
      } else {
        return this.Status.isPowerOn;
      }
    } else {
      return this.Status.isPowerOn;
    }
  }

  timerStatus() {
    const status = this.Status;
    if (!this.onStatus() || status.remainDuration === 0 || status.isStandby) {
      return 0;
    } else {
      return 1;
    }
  }

  getRinseLevel(): number {
    if (this.Status.data.state.includes('RUNNING')) {
      this.rinseLevel = this.Status.data.rinseLevel || 'LEVEL_1';
    }
    let rinseStatus = 0;
    if (this.rinseLevel === 'LEVEL_0') {
      rinseStatus = 1;
    }

    return rinseStatus;
  }

  getRinseLevelPercent(): number {
    let levelPercent = this.rinseLevel;
    if (this.Status.data.state.includes('RUNNING')) {
      levelPercent = this.Status.data.rinseLevel || 'LEVEL_1';
    }
    let rinseLevelPercent = 100;
    if (levelPercent === 'LEVEL_0') {
      rinseLevelPercent = 0;
    } else if (levelPercent === 'LEVEL_1') {
      rinseLevelPercent = 50;
    }
    return rinseLevelPercent;
  }

  getRinseLevelStatus(): number {
    let levelStatus = this.rinseLevel;
    if (this.Status.data.state.includes('RUNNING')) {
      levelStatus = this.Status.data.rinseLevel || 'LEVEL_1';
    }
    let rinseLevelStatus = 0;
    if (levelStatus === 'LEVEL_0') {
      rinseLevelStatus = 1;
    }
    return rinseLevelStatus;
  }

  resetTimeSettings() {
    this.showTime = false;
    this.firstTime = true;
    this.firstDelay = true;
    this.courseStartString = 'Cycle Start Time Not Set';
    this.courseTimeString = 'Cycle Duration Not Set';
    this.courseTimeEndString = 'Cycle End Time Not Set';
    updateCharacteristicIfChanged(
      this.startTime,
      this.platform.Characteristic.TargetVisibilityState,
      this.showTime ? this.platform.Characteristic.TargetVisibilityState.SHOWN : this.platform.Characteristic.TargetVisibilityState.HIDDEN);
    updateCharacteristicIfChanged(
      this.startTime,
      this.platform.Characteristic.CurrentVisibilityState,
      this.showTime ? this.platform.Characteristic.CurrentVisibilityState.SHOWN : this.platform.Characteristic.CurrentVisibilityState.HIDDEN);
    updateCharacteristicIfChanged(
      this.courseDuration,
      this.platform.Characteristic.TargetVisibilityState,
      this.showTime ? this.platform.Characteristic.TargetVisibilityState.SHOWN : this.platform.Characteristic.TargetVisibilityState.HIDDEN);
    updateCharacteristicIfChanged(
      this.courseDuration,
      this.platform.Characteristic.CurrentVisibilityState,
      this.showTime ? this.platform.Characteristic.CurrentVisibilityState.SHOWN : this.platform.Characteristic.CurrentVisibilityState.HIDDEN);
    updateCharacteristicIfChanged(
      this.endTime,
      this.platform.Characteristic.TargetVisibilityState,
      this.showTime ? this.platform.Characteristic.TargetVisibilityState.SHOWN : this.platform.Characteristic.TargetVisibilityState.HIDDEN);
    updateCharacteristicIfChanged(
      this.endTime,
      this.platform.Characteristic.CurrentVisibilityState,
      this.showTime ? this.platform.Characteristic.CurrentVisibilityState.SHOWN : this.platform.Characteristic.CurrentVisibilityState.HIDDEN);
  }

  public update(snapshot: any) {
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
          this.serviceEventFinished?.updateCharacteristic(OccupancyDetected, OccupancyDetected.OCCUPANCY_NOT_DETECTED);
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
  private readonly dishwasherState: DishwasherState;

  constructor(data: any, deviceModel: DeviceModel) {
    const dishwasherState = readDishwasherState(data, deviceModel);
    super(dishwasherState.data, deviceModel);
    this.dishwasherState = dishwasherState;
  }

  public get isPowerOn() {
    return this.dishwasherState.isPowerOn;
  }

  public get isRunning() {
    return this.dishwasherState.isRunning;
  }

  public get isDoorClosed() {
    return this.dishwasherState.isDoorClosed;
  }

  public get isStandby() {
    return this.dishwasherState.isStandby;
  }

  public get isDelayReserved() {
    return this.dishwasherState.isDelayReserved;
  }

  public get remainDuration() {
    return this.dishwasherState.remainDuration;
  }

  public get initialDuration() {
    return this.dishwasherState.initialDuration;
  }
}
