import {Column} from './Column'
import {Expr} from './Expr'

// https://github.com/Microsoft/TypeScript/issues/29368#issuecomment-453529532
type Field<T> = [T] extends [Array<any>]
  ? Expr<T>
  : [T] extends [Column.Primary<infer K, infer V>]
  ? Expr<string extends K ? V : V & {[Column.isPrimary]: K}>
  : [T] extends [Column.Optional<infer V>]
  ? Field<V>
  : [T] extends [number | string | boolean]
  ? Expr<T>
  : [T] extends [Record<string, any>]
  ? FieldsOf<T>
  : Expr<T>

type FieldsOf<Row> = Row extends Record<string, any>
  ? {[K in keyof Row]-?: Field<Row[K]>}
  : never

// Source: https://stackoverflow.com/a/61625831/5872160
type IsStrictlyAny<T> = (T extends never ? true : false) extends false
  ? false
  : true

export type Fields<T> = IsStrictlyAny<T> extends true ? any : Field<T>
