declare module 'homebridge-lib/EveHomeKitTypes' {
  export class EveHomeKitTypes {
    constructor(homebridge: any);

    Characteristics: Record<string, any>;
    Services: Record<string, any>;
  }
}

declare module 'homebridge-lib' {
}