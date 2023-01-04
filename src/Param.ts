export const enum ParamType {
  Value = 'Value',
  Named = 'Named'
}

export type ParamData =
  | {type: ParamType.Value; value: any}
  | {type: ParamType.Named; name: string}

export const ParamData = {
  Value(value: any): ParamData {
    return {type: ParamType.Value, value: value}
  },
  Named(name: string): ParamData {
    return {type: ParamType.Named, name: name}
  }
}
