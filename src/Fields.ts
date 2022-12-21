import {Expr} from './Expr'

type FieldsOf<Row> = Row extends Record<string, any>
  ? {
      [K in keyof Row]-?: Row[K] extends Array<any>
        ? Expr<Row[K]>
        : Row[K] extends object | undefined
        ? FieldsOf<Row[K]>
        : Expr<Row[K]>
    }
  : never

// Source: https://stackoverflow.com/a/61625831/5872160
type IsStrictlyAny<T> = (T extends never ? true : false) extends false
  ? false
  : true

export type Fields<T> = IsStrictlyAny<T> extends true
  ? any
  : T extends Record<string, any>
  ? FieldsOf<T>
  : unknown
