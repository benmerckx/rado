import {Column} from './Column'
import {Expr} from './Expr'

// Source: https://www.steveruiz.me/posts/smooshed-object-union
type ObjectUnion<T> = {
  [K in T extends infer P ? keyof P : never]: T extends infer P
    ? K extends keyof P
      ? P[K]
      : never
    : never
}

type RecordField<T> = Expr<T> & FieldsOf<ObjectUnion<T>>

// https://github.com/Microsoft/TypeScript/issues/29368#issuecomment-453529532
type Field<T> = [T] extends [Array<any>]
  ? Expr<T>
  : [T] extends [Column.Primary<infer K, infer V>]
  ? Expr<string extends K ? V : V & {[Column.isPrimary]: K}>
  : [T] extends [Column.Optional<infer V>]
  ? Field<V>
  : [T] extends [number | string | boolean]
  ? Expr<T>
  : [T] extends [Record<string, any> | null]
  ? RecordField<T>
  : Expr<T>

type FieldsOf<Row> = Row extends Record<string, any>
  ? {[K in keyof Row]-?: Field<Row[K]>}
  : never

// Source: https://stackoverflow.com/a/61625831/5872160
type IsStrictlyAny<T> = (T extends never ? true : false) extends false
  ? false
  : true

export type Fields<T> = IsStrictlyAny<T> extends true
  ? any
  : T extends object
  ? FieldsOf<T>
  : Field<T>
