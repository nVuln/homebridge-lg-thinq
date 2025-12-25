import { AccessoryContext, BaseDevice } from '../baseDevice.js';
import { LGThinQHomebridgePlatform } from '../platform.js';
import { Logger, PlatformAccessory, Service } from 'homebridge';
import { Device } from '../lib/Device.js';
import { normalizeNumber } from '../helper.js';
import { WasherDryerStatus } from './WasherDryer.js';
import { SIX_HOURS_IN_SECONDS, TEN_MINUTES_MS, ONE_HOUR_IN_SECONDS, SIX_MINUTES_MS, DISHWASHER_STANDBY_INTERVAL_MS } from '../lib/constants.js';

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

  protected serviceDishwasher: Service;
  protected serviceDoorOpened: Service;
  protected serviceEventFinished: Service | undefined;
  protected tvService: Service;
  protected dishwasherState: Service;
  protected dishwasherOptions: Service;
  protected startTime: Service;
  protected courseDuration: Service;
  protected endTime: Service;
  protected dishwasherRinseLevel: Service;
  protected dishwasherCleanliness: Service;

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
      .onGet(() => {
        return this.onStatus() ? 1 : 0;
      });
    this.tvService
      .setCharacteristic(this.platform.Characteristic.ActiveIdentifier, this.inputID);
    this.tvService
      .getCharacteristic(this.platform.Characteristic.ActiveIdentifier)
      .on('set', (inputIdentifier, callback) => {
        const vNum = normalizeNumber(inputIdentifier);
        if (vNum === null) {
          this.platform.log.error('Dishwasher ActiveIdentifier is not a number');
          callback();
          return;
        }
        if (vNum > 7 || vNum < 1) {
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

    this.dishwasherState = this.createInputSourceService('Dishwasher Status', 'CataNicoGaTa-10030', 1, this.inputName, true);
    this.dishwasherState.getCharacteristic(this.platform.Characteristic.ConfiguredName)
      .on('get', (callback) => {
        this.currentInputName();
        const currentValue = this.inputName;
        callback(null, currentValue);
      });
    this.tvService.addLinkedService(this.dishwasherState);

    this.dishwasherOptions = this.createInputSourceService('Dishwasher Options', 'CataNicoGaTa-10040', 2, this.inputNameOptions, this.onStatus());
    this.dishwasherOptions.getCharacteristic(this.platform.Characteristic.ConfiguredName)
      .on('get', (callback) => {
        this.currentInputName();
        const currentValue = this.inputNameOptions;
        callback(null, currentValue);
      });
    this.tvService.addLinkedService(this.dishwasherOptions);

    this.startTime = this.createInputSourceService('Cycle Start Time', 'CataNico-Always10', 3, this.courseStartString, this.showTime);
    this.startTime.getCharacteristic(this.platform.Characteristic.ConfiguredName)
      .on('get', (callback) => {
        const currentValue = this.courseStartString;
        callback(null, currentValue);
      });
    this.tvService.addLinkedService(this.startTime);

    this.courseDuration = this.createInputSourceService('Cycle Duration', 'CataNico-Always20', 4, this.courseTimeString, this.showTime);
    this.courseDuration.getCharacteristic(this.platform.Characteristic.ConfiguredName)
      .on('get', (callback) => {
        const currentValue = this.courseTimeString;
        callback(null, currentValue);
      });
    this.tvService.addLinkedService(this.courseDuration);

    this.endTime = this.createInputSourceService('Cycle End Time', 'CataNico-Always30', 5, this.courseTimeEndString, this.showTime);
    this.endTime.getCharacteristic(this.platform.Characteristic.ConfiguredName)
      .on('get', (callback) => {
        const currentValue = this.courseTimeEndString;
        callback(null, currentValue);
      });
    this.tvService.addLinkedService(this.endTime);

    this.dishwasherRinseLevel = this.createInputSourceService('Dishwasher Rinse Aid Level', 'CataNicoGaTa-10050', 6, this.inputNameRinse, this.onStatus());
    this.dishwasherRinseLevel.getCharacteristic(this.platform.Characteristic.ConfiguredName)
      .on('get', (callback) => {
        this.updateRinseLevel();
        const currentValue = this.inputNameRinse;
        callback(null, currentValue);
      });
    this.tvService.addLinkedService(this.dishwasherRinseLevel);

    this.dishwasherCleanliness = this.createInputSourceService('Dishwasher Cleanness Status', 'CataNicoGaTa-10060', 7, this.inputNameMachine, this.onStatus());
    this.dishwasherCleanliness.getCharacteristic(this.platform.Characteristic.ConfiguredName)
      .on('get', (callback) => {
        this.updateRinseLevel();
        const currentValue = this.inputNameMachine;
        callback(null, currentValue);
      });
    this.tvService.addLinkedService(this.dishwasherCleanliness);

    this.serviceDishwasher = accessory.getService(Valve) || accessory.addService(Valve, 'LG Dishwasher');
    this.serviceDishwasher.setCharacteristic(Characteristic.Name, device.name);
    this.serviceDishwasher.addOptionalCharacteristic(this.platform.Characteristic.ConfiguredName);
    this.serviceDishwasher.setCharacteristic(this.platform.Characteristic.ConfiguredName, device.name);
    this.serviceDishwasher.setCharacteristic(Characteristic.ValveType, Characteristic.ValveType.IRRIGATION);
    this.serviceDishwasher.getCharacteristic(Characteristic.Active)
      .onSet(this.setActive.bind(this))
      .updateValue(Characteristic.Active.INACTIVE)
      .onGet(() => {
        return this.timerStatus();
      });
    this.serviceDishwasher.setCharacteristic(Characteristic.InUse, Characteristic.InUse.NOT_IN_USE);
    this.serviceDishwasher.getCharacteristic(this.platform.Characteristic.StatusFault)
      .on('get', this.getRinseLevel.bind(this));
    this.serviceDishwasher.getCharacteristic(Characteristic.RemainingDuration).setProps({
      maxValue: SIX_HOURS_IN_SECONDS,
    });
    this.serviceDishwasher.getCharacteristic(this.platform.Characteristic.SetDuration)
      .on('get', (callback) => {
        const currentValue = this.settingDuration;
        callback(null, currentValue);
      })
      .setProps({
        maxValue: SIX_HOURS_IN_SECONDS,
      });

    // Door open state
    this.serviceDoorOpened = accessory.getService(ContactSensor) || accessory.addService(ContactSensor, 'Dishwasher Door');
    this.serviceDoorOpened.addOptionalCharacteristic(this.platform.Characteristic.ConfiguredName);
    this.serviceDoorOpened.setCharacteristic(this.platform.Characteristic.ConfiguredName, 'Dishwasher Door');
    this.serviceDoorOpened.getCharacteristic(this.platform.Characteristic.StatusActive)
      .on('get', this.getDoorStatus.bind(this));
    this.serviceDoorOpened.getCharacteristic(this.platform.Characteristic.BatteryLevel)
      .on('get', this.getRinseLevelPercent.bind(this));
    this.serviceDoorOpened.getCharacteristic(this.platform.Characteristic.StatusLowBattery)
      .on('get', this.getRinseLevelStatus.bind(this));

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
            this.serviceDishwasher.updateCharacteristic(this.platform.Characteristic.Active, this.timerStatus());
            this.tvService.updateCharacteristic(this.platform.Characteristic.Active, this.onStatus() ? 1 : 0);
            this.serviceDoorOpened.updateCharacteristic(this.platform.Characteristic.StatusActive, this.onStatus());
          }, DISHWASHER_STANDBY_INTERVAL_MS);
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
        if (this.Status.data.extraDry.includes('ON') && this.dryCounter > 3 && this.Status.remainDuration === ONE_HOUR_IN_SECONDS) {
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
          if (this.delayTime > ONE_HOUR_IN_SECONDS) {
            hourMinutes = 'Hours';
          }
          if (this.delayTime === ONE_HOUR_IN_SECONDS) {
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
    if (this.dishwasherState.getCharacteristic(this.platform.Characteristic.ConfiguredName).value !== this.inputName) {
      this.dishwasherState.updateCharacteristic(this.platform.Characteristic.ConfiguredName, this.inputName);
    }
    if (!this.Status.isPowerOn) {
      this.inputNameOptions = 'Dishwasher Options';
    }
    if (this.dishwasherOptions.getCharacteristic(this.platform.Characteristic.ConfiguredName).value !== this.inputNameOptions) {
      this.dishwasherOptions.updateCharacteristic(this.platform.Characteristic.ConfiguredName, this.inputNameOptions);
    }
    this.dishwasherOptions.updateCharacteristic(
      this.platform.Characteristic.TargetVisibilityState,
      this.onStatus() ? this.platform.Characteristic.TargetVisibilityState.SHOWN : this.platform.Characteristic.TargetVisibilityState.HIDDEN);
    this.dishwasherOptions.updateCharacteristic(
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
    if (this.Status.remainDuration > ONE_HOUR_IN_SECONDS) {
      hourMinutes = 'Hours';
    }
    if (this.Status.remainDuration === ONE_HOUR_IN_SECONDS) {
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
    if (this.startTime.getCharacteristic(this.platform.Characteristic.ConfiguredName).value !== this.courseStartString) {
      this.startTime.updateCharacteristic(this.platform.Characteristic.ConfiguredName, this.courseStartString);
    }
    if (this.courseDuration.getCharacteristic(this.platform.Characteristic.ConfiguredName).value !== this.courseTimeString) {
      this.courseDuration.updateCharacteristic(this.platform.Characteristic.ConfiguredName, this.courseTimeString);
    }
    if (this.endTime.getCharacteristic(this.platform.Characteristic.ConfiguredName).value !== this.courseTimeEndString) {
      this.endTime.updateCharacteristic(this.platform.Characteristic.ConfiguredName, this.courseTimeEndString);
    }
    this.startTime.updateCharacteristic(
      this.platform.Characteristic.TargetVisibilityState,
      this.showTime ? this.platform.Characteristic.TargetVisibilityState.SHOWN : this.platform.Characteristic.TargetVisibilityState.HIDDEN);
    this.startTime.updateCharacteristic(
      this.platform.Characteristic.CurrentVisibilityState,
      this.showTime ? this.platform.Characteristic.CurrentVisibilityState.SHOWN : this.platform.Characteristic.CurrentVisibilityState.HIDDEN);
    this.courseDuration.updateCharacteristic(
      this.platform.Characteristic.TargetVisibilityState,
      this.showTime ? this.platform.Characteristic.TargetVisibilityState.SHOWN : this.platform.Characteristic.TargetVisibilityState.HIDDEN);
    this.courseDuration.updateCharacteristic(
      this.platform.Characteristic.CurrentVisibilityState,
      this.showTime ? this.platform.Characteristic.CurrentVisibilityState.SHOWN : this.platform.Characteristic.CurrentVisibilityState.HIDDEN);
    this.endTime.updateCharacteristic(
      this.platform.Characteristic.TargetVisibilityState,
      this.showTime ? this.platform.Characteristic.TargetVisibilityState.SHOWN : this.platform.Characteristic.TargetVisibilityState.HIDDEN);
    this.endTime.updateCharacteristic(
      this.platform.Characteristic.CurrentVisibilityState,
      this.showTime ? this.platform.Characteristic.CurrentVisibilityState.SHOWN : this.platform.Characteristic.CurrentVisibilityState.HIDDEN);
  }

  setActive() {
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
    if (this.Status.remainDuration !== this.serviceDishwasher.getCharacteristic(Characteristic.RemainingDuration).value) {
      if (this.Status.data.extraDry.includes('ON') && this.Status.remainDuration === 3600) {
        this.dryCounter += 1;
      }
      if (this.dryCounter <= 3) {
        this.serviceDishwasher.updateCharacteristic(Characteristic.RemainingDuration, this.Status.remainDuration);
      }
    }
    if (this.Status.isPowerOn) {
      this.settingDuration = this.Status.data.initialTimeHour * 60 * 60 + this.Status.data.initialTimeMinute * 60;
    }
    if (this.settingDuration !== this.serviceDishwasher.getCharacteristic(Characteristic.SetDuration).value) {
      this.serviceDishwasher.updateCharacteristic(this.platform.Characteristic.SetDuration, this.settingDuration);
    }
    this.serviceDishwasher.updateCharacteristic(Characteristic.Active, this.timerStatus());
    this.tvService.updateCharacteristic(this.platform.Characteristic.Active, this.onStatus() ? 1 : 0);
    if (this.Status.data.delayStart === 'ON' && this.Status.data.process.includes('RESER')) {
      this.serviceDishwasher.updateCharacteristic(Characteristic.InUse, 0);

    } else if (this.Status.data.state.includes('STAND')) {
      this.serviceDishwasher.updateCharacteristic(Characteristic.InUse, 0);
    } else {
      this.serviceDishwasher.updateCharacteristic(Characteristic.InUse, this.Status.isRunning ? 1 : 0);

    }
    if (this.serviceDoorOpened) {
      const contactSensorValue = this.Status.isDoorClosed ?
        Characteristic.ContactSensorState.CONTACT_DETECTED : Characteristic.ContactSensorState.CONTACT_NOT_DETECTED;
      this.serviceDoorOpened.updateCharacteristic(Characteristic.ContactSensorState, contactSensorValue);
    }
    this.currentInputName();
    if (this.Status.data.state.includes('RUNNING') && !this.Status.data.process.includes('RESERVED') && this.firstTime) {
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
    this.serviceDishwasher.updateCharacteristic(this.platform.Characteristic.StatusFault, rinseLevelStatus);
    this.serviceDoorOpened.updateCharacteristic(this.platform.Characteristic.StatusActive, this.onStatus());
    this.serviceDoorOpened.updateCharacteristic(this.platform.Characteristic.BatteryLevel, rinseLevelPercent);
    this.serviceDoorOpened.updateCharacteristic(this.platform.Characteristic.StatusLowBattery, rinseLevelStatus);

    if (this.Status.data.tclCount > 30) {
      this.inputID = 7;
      this.inputNameMachine = 'Machine Cleaning Cycle is Needed Soon';
      if (this.dishwasherCleanliness.getCharacteristic(this.platform.Characteristic.ConfiguredName).value !== this.inputNameMachine) {
        this.dishwasherCleanliness.updateCharacteristic(this.platform.Characteristic.ConfiguredName, this.inputNameMachine);
      }
      this.dishwasherCleanliness.updateCharacteristic(
        this.platform.Characteristic.TargetVisibilityState,
        this.onStatus() ? this.platform.Characteristic.TargetVisibilityState.SHOWN : this.platform.Characteristic.TargetVisibilityState.HIDDEN);
      this.dishwasherCleanliness.updateCharacteristic(
        this.platform.Characteristic.CurrentVisibilityState,
        this.onStatus() ? this.platform.Characteristic.CurrentVisibilityState.SHOWN : this.platform.Characteristic.CurrentVisibilityState.HIDDEN);

    } else {
      this.inputNameMachine = 'Dishwasher is Clean';
      if (this.dishwasherCleanliness.getCharacteristic(this.platform.Characteristic.ConfiguredName).value !== this.inputNameMachine) {
        this.dishwasherCleanliness.updateCharacteristic(this.platform.Characteristic.ConfiguredName, this.inputNameMachine);
      }
      this.dishwasherCleanliness.updateCharacteristic(
        this.platform.Characteristic.TargetVisibilityState, this.platform.Characteristic.TargetVisibilityState.HIDDEN);
      this.dishwasherCleanliness.updateCharacteristic(
        this.platform.Characteristic.CurrentVisibilityState, this.platform.Characteristic.CurrentVisibilityState.HIDDEN);
    }
    if (this.dishwasherRinseLevel.getCharacteristic(this.platform.Characteristic.ConfiguredName).value !== this.inputNameRinse) {
      this.dishwasherRinseLevel.updateCharacteristic(this.platform.Characteristic.ConfiguredName, this.inputNameRinse);
    }
    this.dishwasherRinseLevel.updateCharacteristic(
      this.platform.Characteristic.TargetVisibilityState,
      this.onStatus() ? this.platform.Characteristic.TargetVisibilityState.SHOWN : this.platform.Characteristic.TargetVisibilityState.HIDDEN);
    this.dishwasherRinseLevel.updateCharacteristic(
      this.platform.Characteristic.CurrentVisibilityState,
      this.onStatus() ? this.platform.Characteristic.CurrentVisibilityState.SHOWN : this.platform.Characteristic.CurrentVisibilityState.HIDDEN);
  }

  onStatus() {
    const newCurrentTime = new Date();
    const newCurrentTimeMS = newCurrentTime.getTime();
    if (this.standbyTimetMS !== 0) {
      if (newCurrentTimeMS - this.standbyTimetMS > SIX_MINUTES_MS) {
        return false;
      } else {
        return this.Status.isPowerOn;
      }
    } else {
      return this.Status.isPowerOn;
    }
  }

  timerStatus() {
    if (!this.onStatus || this.Status.remainDuration === 0 || this.Status.data.state.includes('STAND')) {
      return 0;
    } else {
      return 1;
    }
  }

  getRinseLevel(callback: (error: Error | null, result?: number) => void) {
    if (this.Status.data.state.includes('RUNNING')) {
      this.rinseLevel = this.Status.data.rinseLevel || 'LEVEL_1';
    }
    let rinseStatus = 0;
    if (this.rinseLevel === 'LEVEL_0') {
      rinseStatus = 1;
    }

    callback(null, rinseStatus);
  }

  getDoorStatus(callback: (error: Error | null, result?: boolean) => void) {
    const currentStatus = this.onStatus();
    callback(null, currentStatus);
  }

  getRinseLevelPercent(callback: (error: Error | null, result: number) => void) {
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
    callback(null, rinseLevelPercent);
  }

  getRinseLevelStatus(callback: (error: Error | null, result: number) => void) {
    let levelStatus = this.rinseLevel;
    if (this.Status.data.state.includes('RUNNING')) {
      levelStatus = this.Status.data.rinseLevel || 'LEVEL_1';
    }
    let rinseLevelStatus = 0;
    if (levelStatus === 'LEVEL_0') {
      rinseLevelStatus = 1;
    }
    callback(null, rinseLevelStatus);
  }

  resetTimeSettings() {
    this.showTime = false;
    this.firstTime = true;
    this.firstDelay = true;
    this.courseStartString = 'Cycle Start Time Not Set';
    this.courseTimeString = 'Cycle Duration Not Set';
    this.courseTimeEndString = 'Cycle End Time Not Set';
    this.startTime.updateCharacteristic(
      this.platform.Characteristic.TargetVisibilityState, 
      this.showTime ? this.platform.Characteristic.TargetVisibilityState.SHOWN : this.platform.Characteristic.TargetVisibilityState.HIDDEN);
    this.startTime.updateCharacteristic(
      this.platform.Characteristic.CurrentVisibilityState,
      this.showTime ? this.platform.Characteristic.CurrentVisibilityState.SHOWN : this.platform.Characteristic.CurrentVisibilityState.HIDDEN);
    this.courseDuration.updateCharacteristic(
      this.platform.Characteristic.TargetVisibilityState,
      this.showTime ? this.platform.Characteristic.TargetVisibilityState.SHOWN : this.platform.Characteristic.TargetVisibilityState.HIDDEN);
    this.courseDuration.updateCharacteristic(
      this.platform.Characteristic.CurrentVisibilityState,
      this.showTime ? this.platform.Characteristic.CurrentVisibilityState.SHOWN : this.platform.Characteristic.CurrentVisibilityState.HIDDEN);
    this.endTime.updateCharacteristic(
      this.platform.Characteristic.TargetVisibilityState,
      this.showTime ? this.platform.Characteristic.TargetVisibilityState.SHOWN : this.platform.Characteristic.TargetVisibilityState.HIDDEN);
    this.endTime.updateCharacteristic(
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
        }, TEN_MINUTES_MS);
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
