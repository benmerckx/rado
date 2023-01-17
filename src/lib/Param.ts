import {Expr, ExprData} from './Expr'

export enum ParamType {
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

export type Params<T> = {
  [K in keyof T]: Expr<T[K]>
}

export function createParams<T>(): Params<T> {
  return new Proxy({} as Params<T>, {
    get(target, prop) {
      return new Expr(ExprData.Param(ParamData.Named(prop as string)))
    }
  })
}
