export enum ParamType {
  Value = 'ParamData.Value',
  Named = 'ParamData.Named'
}

export namespace ParamData {
  export class Value {
    type = ParamType.Value as const
    constructor(public value: any) {}
  }
  export class Named {
    type = ParamType.Named as const
    constructor(public name: string) {}
  }
}

export type ParamData = ParamData.Value | ParamData.Named
