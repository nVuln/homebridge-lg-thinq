declare module 'homebridge-lib/EveHomeKitTypes' {
  export class EveHomeKitTypes {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(homebridge: any);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Characteristics: Record<string, any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Services: Record<string, any>;
  }
}

declare module 'homebridge-lib' {
}