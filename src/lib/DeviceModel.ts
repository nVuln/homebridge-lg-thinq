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
    const data = this.data.Value[name];
    if (data === undefined) {
      return null;
    }

    switch (data.type.toLowerCase()) {
      case 'enum':
        return {
          type: ValueType.Enum,
          options: data.option,
        } as EnumValue;

      case 'range':
        return {
          type: ValueType.Range,
          min: data.option.min,
          max: data.option.max,
          step: data.option?.step || 1,
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
    return this.data.Value[name].default;
  }

  public enumValue(key: string, name: string) {
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
    const options = (this.value(key) as EnumValue).options;
    if (!(value in options)) {
      return null;
    }

    return options[value];
  }

  public referenceName(key: string, value: any): string | null {
    const val = String(value);
    const reference = (this.value(key) as ReferenceValue).reference;

    if (val in reference) {
      return reference[val]._comment;
    }

    return null;
  }

  public decodeMonitor(data: any) {
    if (this.data.Monitoring.type === 'BINARY(BYTE)') {
      return this.decodeMonitorBinary(data);
    }

    return JSON.parse(data);
  }

  private decodeMonitorBinary(data: any) {
    const decoded: { [key: string]: any } = {};

    for (const item of this.data.Monitoring.protocol) {
      const key = item.value;
      let value = 0;

      for (let i = item.startByte; i < item.startByte + item.length; i++) {
        const v = data[i];
        value = (value << 8) + v;
        decoded[key] = String(value);
      }
    }

    return decoded;
  }
}
