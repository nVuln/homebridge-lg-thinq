export enum ValueType {
  Bit = 'Bit',
  Enum = 'Enum',
  Range = 'Range',
  Reference = 'Reference',
  StringComment = 'StringComment',
}

export interface ModelDataValue {
  type: string;

  [key: string]: any;
}

export interface MonitoringValue {
  dataType: string;
  valueMapping: {
    [key: string]: {
      index: string;
      label: string;
    };
  };
}
export interface ModelData {
  Info: {
    productType: string;
    productCode: string;
    coutnry: string;
    modelType: string;
    model: string;
    modelName: string;
    networkType: string;
    version: string;
  };
  Value: {
    [key: string]: ModelDataValue;
  };
  MonitoringValue: {
    [key: string]: MonitoringValue;
  };

  [key: string]: any;
}

export interface BitValue {
  type: ValueType.Bit;
  options: any;
}

export interface EnumValue {
  type: ValueType.Enum;
  options: any;
}

export interface RangeValue {
  type: ValueType.Range;
  min: number;
  max: number;
  step: number;
}

export interface ReferenceValue {
  type: ValueType.Reference;
  reference: any;
}

export interface StringCommentValue {
  type: ValueType.StringComment;
  comment: string;
}

export class DeviceModel {
  public constructor(
    public data: ModelData,
  ) {
  }

  public get monitoringValue() {
    return this.data.MonitoringValue;
  }

  public value(name: string) {
    let data = this.data.Value[name];
    if (data === undefined && this.data.Monitoring?.type === 'THINQ2') {
      // convert key to thinq2 monitoring value
      const protocol = this.data.Monitoring?.protocol;

      /**
       * sample: "protocol": {
       * 			"state": "State",
       * 			"process": "Process",
       * 			"error": "Error",
       * 			"initialTimeHour": "Initial_Time_H",
       * 			"initialTimeMinute": "Initial_Time_M",
       * 			"course": "Course",
       * 			"courseType": "CourseType",
       * 			"remainTimeHour": "Remain_Time_H",
       * 			"remainTimeMinute": "Remain_Time_M",
       * 			"reserveTimeHour": "Reserve_Time_H",
       * 			"reserveTimeMinute": "Reserve_Time_M",
       * 			"childLock": "ChildLock",
       * 			"door": "Door",
       * 			"rinseRefill": "RinseRefill",
       * 			"saltRefill": "SaltRefill",
       * 			"signalLevel": "SignalLevel",
       * 			"mcReminderSetting": "MCReminderSetting",
       * 			"cleanLReminder": "CleanLReminder",
       * 			"nightDry": "NightDry",
       * 			"delayStart": "DelayStart",
       * 			"energySaver": "EnergySaver",
       * 			"extraDry": "ExtraDry",
       * 			"highTemp": "HighTemp",
       * 			"dualZone": "DualZone",
       * 			"halfLoad": "HalfLoad",
       * 			"autoDoor": "AutoDoor",
       * 			"preSteam": "PreSteam",
       * 			"steam": "Steam",
       * 			"rinseLevel": "RinseLevel",
       * 			"softeningLevel": "SofteningLevel",
       * 			"smartCourse": "SmartCourse",
       * 			"currentDownloadCourse": "CurrentDownloadCourse",
       * 			"tclCount": "TclCount"
       * 		}
       */
      if (protocol.constructor.name === 'Object' && protocol[name] !== undefined) {
        data = this.data.Value[this.data.Monitoring?.protocol[name]];
      }
      /**
       * sample: "protocol": [{
       * 				"_comment": "Hood Operation State(1byte)",
       * 				"superSet": "hoodState.hoodState",
       * 				"value": "HoodState"
       * 			},
       *      {
       * 				"_comment": "VentState",
       * 				"superSet": "hoodState.ventLevel",
       * 				"value": "VentLevel"
       * 			},
       *      {
       * 				"_comment": "VentMode",
       * 				"superSet": "hoodState.ventMode",
       * 				"value": "VentMode"
       * 			},
       *      {
       * 				"_comment": "TimerMin",
       * 				"superSet": "hoodState.remainTimeMinute",
       * 				"value": "TimerMin"
       * 			},
       *      {
       * 				"_comment": "TimerSec",
       * 				"superSet": "hoodState.remainTimeSecond",
       * 				"value": "TimerSec"
       * 			},
       *      {
       * 				"_comment": "LightState",
       * 				"superSet": "hoodState.lampLevel",
       * 				"value": "LampLevel"
       * 			},
       *      {
       * 				"_comment": "Dummy-meaningless",
       * 				"superSet": "hoodState.dummyData",
       * 				"value": "Dummy"
       * 			},
       *      {
       * 				"_comment": "HoodStateInfo",
       * 				"superSet": null,
       * 				"value": "HoodStateInfo"
       * 			},
       *      {
       * 				"_comment": "WiFi Access Enable",
       * 				"superSet": null,
       * 				"value": "WiFiAccess"
       * 			}
       *    ]
       */
      else if (protocol.constructor.name === 'Array' && protocol.find(p => p.superSet === name) !== undefined) {
        data = this.data.Value[protocol.find(p => p.superSet === name).value];
      }
    }

    if (data === undefined) {
      return null;
    }

    const type = data.type || data.data_type;
    switch (type.toLowerCase()) {
      case 'enum':
        return {
          type: ValueType.Enum,
          options: data.option || data.value_mapping,
        } as EnumValue;

      case 'range':
        return {
          type: ValueType.Range,
          min: (data.option || data.value_validation)?.min,
          max: (data.option || data.value_validation)?.max,
          step: (data.option || data.value_validation)?.step || 1,
        } as RangeValue;

      case 'bit': {
        const bitValues = Object.values(data.option).reduce((obj: any, value) => ({
          ...obj,
          [(value as any).startbit]: (value as any).values,
        }), {});
        return { type: ValueType.Bit, options: bitValues } as BitValue;
      }

      case 'reference': {
        const [ref] = data.option;
        return { type: ValueType.Reference, reference: this.data[ref] } as ReferenceValue;
      }

      case 'string':
        if (typeof data._comment === 'string') {
          return { type: ValueType.StringComment, comment: data._comment } as StringCommentValue;
        }
        return null;

      default:
        throw new Error(`Unsupported value type: ${data.type}`);
    }
  }

  public default(name: string) {
    return this.data?.Value[name]?.default;
  }

  public enumValue(key: string, name: string) {
    if (this.value(key)?.type !== ValueType.Enum) {
      return null;
    }

    const options = (this.value(key) as EnumValue).options;
    // invert them pa
    const optionsInv = ((obj) => {
      const ret = {};
      Object.keys(obj).forEach(key => {
        ret[obj[key]] = key;
      });
      return ret;
    })(options);

    return optionsInv[name];
  }

  public enumName(key: string, value: string) {
    if (this.value(key)?.type !== ValueType.Enum) {
      return null;
    }

    const options = (this.value(key) as EnumValue).options;
    if (!(value in options)) {
      return null;
    }

    return options[value];
  }

  public monitoringValueMapping(key) {
    if (this.data.Value && this.value(key)) {
      return (this.value(key) as EnumValue).options;
    }

    if (typeof this.monitoringValue !== 'object' || !(key in this.monitoringValue)) {
      return null;
    }

    return this.monitoringValue[key].valueMapping || null;
  }

  public lookupMonitorValue(key: string, name: string, default_value: null | string = null) {
    if (this.data.Value) {
      return this.enumName(key, name) || default_value;
    }

    if (!this.monitoringValueMapping(key) || !(name in this.monitoringValueMapping(key))) {
      return default_value;
    }

    return this.monitoringValueMapping(key)[name]?.label || default_value || null;
  }

  public lookupMonitorName(key: string, label: string) {
    if (this.data.Value) {
      return this.enumValue(key, label);
    }

    if (!(key in this.monitoringValue)) {
      return null;
    }

    function getKeyByValue(obj, value) {
      return Object.keys(obj).find(key => obj[key].label === value);
    }

    return getKeyByValue(this.monitoringValue[key].valueMapping, label) || null;
  }

  public decodeMonitor(data: any) {
    if (this.data.Monitoring?.type === 'BINARY(BYTE)') {
      return this.decodeMonitorBinary(data);
    } else if (this.data.Monitoring?.type === 'BINARY(HEX)') {
      return this.decodeMonitorBinary(data, 16);
    }

    try {
      return JSON.parse(data.toString());
    } catch (err) {
      return data;
    }
  }

  private decodeMonitorBinary(data: any, length = 8) {
    const decoded: { [key: string]: any } = {};

    for (const item of this.data.Monitoring.protocol) {
      const key = item.value;
      let value = 0;

      for (let i = item.startByte; i < item.startByte + item.length; i++) {
        const v = data[i];
        value = (value << length) + v;
        decoded[key] = isNaN(value) ? null : String(value);
      }
    }

    return decoded;
  }
}
