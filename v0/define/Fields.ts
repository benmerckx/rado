import {Column} from './Column.js'
import type {Expr, ObjectExpr} from './Expr.js'

// Source: https://www.steveruiz.me/posts/smooshed-object-union
type ObjectUnion<T> = {
  [K in T extends infer P ? keyof P : never]: T extends infer P
    ? K extends keyof P
      ? P[K]
      : never
    : never
}

type Expand<T> = {[K in keyof T]: T[K]} & {}
type ObjectField<T> = Expand<ObjectExpr & FieldsOf<ObjectUnion<T>>>

type FieldsOf<Row> = [Row] extends [Record<string, any>]
  ? {[K in keyof Row]-?: Field<Row[K]>}
  : never

// https://github.com/Microsoft/TypeScript/issues/29368#issuecomment-453529532
type Field<T> = [NonNullable<T>] extends [{[Column.IsPrimary]: any}]
  ? Expr<T>
  : [NonNullable<T>] extends [Array<any>]
    ? Expr<T>
    : [NonNullable<T>] extends [object]
      ? ObjectField<T>
      : Expr<T>

// Source: https://stackoverflow.com/a/61625831/5872160
type IsStrictlyAny<T> = (T extends never ? true : false) extends false
  ? false
  : true

export type Fields<T> = IsStrictlyAny<T> extends true ? any : Field<T>
