import {Fields} from './Fields'
import {OrderBy, OrderDirection} from './OrderBy'
import {ParamData, ParamType} from './Param'
import {Query, QueryData} from './Query'
import {Selection} from './Selection'
import {Target} from './Target'

const TO_EXPR = Symbol('Expr.ToExpr')
const IS_EXPR = Symbol('Expr.IsExpr')
const DATA = Symbol('Expr.Data')

const {fromEntries, entries} = Object

export enum UnOpType {
  Not = 'Not',
  IsNull = 'IsNull'
}

export enum BinOpType {
  Add = 'Add',
  Subt = 'Subt',
  Mult = 'Mult',
  Mod = 'Mod',
  Div = 'Div',
  Greater = 'Greater',
  GreaterOrEqual = 'GreaterOrEqual',
  Less = 'Less',
  LessOrEqual = 'LessOrEqual',
  Equals = 'Equals',
  NotEquals = 'NotEquals',
  And = 'And',
  Or = 'Or',
  Like = 'Like',
  Glob = 'Glob',
  Match = 'Match',
  In = 'In',
  NotIn = 'NotIn',
  Concat = 'Concat'
}

export enum ExprType {
  UnOp = 'UnOp',
  BinOp = 'BinOp',
  Field = 'Field',
  Param = 'Param',
  Call = 'Call',
  Query = 'Query',
  Record = 'Record',
  Row = 'Row',
  Map = 'Map',
  Filter = 'Filter',
  Merge = 'Merge'
}

export type ExprData =
  | ExprData.UnOp
  | ExprData.BinOp
  | ExprData.Field
  | ExprData.Param
  | ExprData.Call
  | ExprData.Query
  | ExprData.Record
  | ExprData.Merge
  | ExprData.Row
  | ExprData.Map
  | ExprData.Filter

export namespace ExprData {
  export type UnOp = {type: ExprType.UnOp; op: UnOpType; expr: ExprData}
  export type BinOp = {
    type: ExprType.BinOp
    op: BinOpType
    a: ExprData
    b: ExprData
  }
  export type Field = {type: ExprType.Field; expr: ExprData; field: string}
  export type Param = {type: ExprType.Param; param: ParamData}
  export type Call = {
    type: ExprType.Call
    method: string
    params: Array<ExprData>
  }
  export type Query = {type: ExprType.Query; query: QueryData.Select}
  export type Record = {
    type: ExprType.Record
    fields: {[key: string]: ExprData}
  }
  export type Merge = {type: ExprType.Merge; a: ExprData; b: ExprData}
  export type Row = {type: ExprType.Row; target: Target}
  export type Map = {type: ExprType.Map; target: Target; result: ExprData}
  export type Filter = {
    type: ExprType.Filter
    target: Target
    condition: ExprData
  }
}

export namespace ExprData {
  export function UnOp(op: UnOpType, expr: ExprData): ExprData.UnOp {
    return {type: ExprType.UnOp, op, expr}
  }
  export function BinOp(
    op: BinOpType,
    a: ExprData,
    b: ExprData
  ): ExprData.BinOp {
    return {type: ExprType.BinOp, op, a, b}
  }
  export function Field(expr: ExprData, field: string): ExprData.Field {
    return {type: ExprType.Field, expr, field}
  }
  export function Param(param: ParamData): ExprData.Param {
    return {type: ExprType.Param, param}
  }
  export function Call(method: string, params: Array<ExprData>): ExprData.Call {
    return {type: ExprType.Call, method, params}
  }
  export function Query(query: QueryData.Select): ExprData.Query {
    return {type: ExprType.Query, query}
  }
  export function Record(fields: {[key: string]: ExprData}): ExprData.Record {
    return {type: ExprType.Record, fields}
  }
  export function Merge(a: ExprData, b: ExprData): ExprData.Merge {
    return {type: ExprType.Merge, a, b}
  }
  export function Row(target: Target): ExprData.Row {
    return {type: ExprType.Row, target}
  }
  export function Map(target: Target, result: ExprData): ExprData.Map {
    return {type: ExprType.Map, target, result}
  }
  export function Filter(target: Target, condition: ExprData): ExprData.Filter {
    return {type: ExprType.Filter, target, condition}
  }

  export function create(input: any): ExprData {
    if (input === null || input === undefined)
      return ExprData.Param(ParamData.Value(null))
    if (
      input &&
      (typeof input === 'function' || typeof input === 'object') &&
      input[TO_EXPR]
    )
      input = input[TO_EXPR]()
    if (Expr.isExpr(input)) return input[DATA]
    if (input && typeof input === 'object' && !Array.isArray(input))
      return ExprData.Record(
        fromEntries(
          entries(input).map(([key, value]) => [key, ExprData.create(value)])
        )
      )
    return ExprData.Param(ParamData.Value(input))
  }
}

/** Expression or value of type T */
export type EV<T> = Expr<T> | T

export class Expr<T> {
  constructor(expr: ExprData) {
    this[DATA] = expr
  }

  [DATA]: ExprData;
  [IS_EXPR] = true

  asc(): OrderBy {
    return {expr: this[DATA], order: OrderDirection.Asc}
  }

  desc(): OrderBy {
    return {expr: this[DATA], order: OrderDirection.Desc}
  }

  not(): Expr<boolean> {
    return new Expr(ExprData.UnOp(UnOpType.Not, this[DATA]))
  }

  or(this: Expr<boolean>, that: EV<boolean>): Expr<boolean> {
    const a = this
    const b = Expr.create(that)
    if (b.isConstant(true) || a.isConstant(false)) return b
    if (a.isConstant(true) || b.isConstant(false)) return this
    return new Expr(ExprData.BinOp(BinOpType.Or, a[DATA], b[DATA]))
  }

  and(this: Expr<boolean>, that: EV<boolean>): Expr<boolean> {
    const a = this
    const b = Expr.create(that)
    if (b.isConstant(true) || a.isConstant(false)) return this
    if (a.isConstant(true) || b.isConstant(false)) return b
    return new Expr(ExprData.BinOp(BinOpType.And, a[DATA], b[DATA]))
  }

  is(that: EV<T> | Query.SelectSingle<T>): Expr<boolean> {
    if (that === null || (Expr.isExpr(that) && that.isConstant(null)))
      return this.isNull()
    return new Expr(
      ExprData.BinOp(BinOpType.Equals, this[DATA], ExprData.create(that))
    )
  }

  isConstant(value: T): boolean {
    switch (this[DATA].type) {
      case ExprType.Param:
        switch (this[DATA].param.type) {
          case ParamType.Value:
            return this[DATA].param.value === value
          default:
            return false
        }
      default:
        return false
    }
  }

  isNot(that: EV<T>): Expr<boolean> {
    if (that === null || (Expr.isExpr(that) && that.isConstant(null)))
      return this.isNotNull()
    return new Expr(
      ExprData.BinOp(BinOpType.NotEquals, this[DATA], ExprData.create(that))
    )
  }

  isNull(): Expr<boolean> {
    return new Expr(ExprData.UnOp(UnOpType.IsNull, this[DATA]))
  }

  isNotNull(): Expr<boolean> {
    return this.isNull().not()
  }

  isIn(that: EV<Array<T>> | Query.SelectMultiple<T>): Expr<boolean> {
    return new Expr(
      ExprData.BinOp(BinOpType.In, this[DATA], ExprData.create(that))
    )
  }

  isNotIn(that: EV<Array<T>> | Query.SelectMultiple<T>): Expr<boolean> {
    return new Expr(
      ExprData.BinOp(BinOpType.NotIn, this[DATA], ExprData.create(that))
    )
  }

  isGreater(that: EV<any>): Expr<boolean> {
    return new Expr(
      ExprData.BinOp(BinOpType.Greater, this[DATA], ExprData.create(that))
    )
  }

  isGreaterOrEqual(that: EV<any>): Expr<boolean> {
    return new Expr(
      ExprData.BinOp(
        BinOpType.GreaterOrEqual,
        this[DATA],
        ExprData.create(that)
      )
    )
  }

  isLess(that: EV<any>): Expr<boolean> {
    return new Expr(
      ExprData.BinOp(BinOpType.Less, this[DATA], ExprData.create(that))
    )
  }

  isLessOrEqual(that: EV<any>): Expr<boolean> {
    return new Expr(
      ExprData.BinOp(BinOpType.LessOrEqual, this[DATA], ExprData.create(that))
    )
  }

  add(this: Expr<number>, that: EV<number>): Expr<number> {
    return new Expr(
      ExprData.BinOp(BinOpType.Add, this[DATA], ExprData.create(that))
    )
  }

  substract(this: Expr<number>, that: EV<number>): Expr<number> {
    return new Expr(
      ExprData.BinOp(BinOpType.Subt, this[DATA], ExprData.create(that))
    )
  }

  multiply(this: Expr<number>, that: EV<number>): Expr<number> {
    return new Expr(
      ExprData.BinOp(BinOpType.Mult, this[DATA], ExprData.create(that))
    )
  }

  remainder(this: Expr<number>, that: EV<number>): Expr<number> {
    return new Expr(
      ExprData.BinOp(BinOpType.Mod, this[DATA], ExprData.create(that))
    )
  }

  divide(this: Expr<number>, that: EV<number>): Expr<number> {
    return new Expr(
      ExprData.BinOp(BinOpType.Div, this[DATA], ExprData.create(that))
    )
  }

  concat(this: Expr<string>, that: EV<string>): Expr<string> {
    return new Expr(
      ExprData.BinOp(BinOpType.Concat, this[DATA], ExprData.create(that))
    )
  }

  like(this: Expr<string>, that: EV<string>): Expr<boolean> {
    return new Expr(
      ExprData.BinOp(BinOpType.Like, this[DATA], ExprData.create(that))
    )
  }

  glob(this: Expr<string>, that: EV<string>): Expr<boolean> {
    return new Expr(
      ExprData.BinOp(BinOpType.Glob, this[DATA], ExprData.create(that))
    )
  }

  match(this: Expr<string>, that: EV<string>): Expr<boolean> {
    return new Expr(
      ExprData.BinOp(BinOpType.Match, this[DATA], ExprData.create(that))
    )
  }

  with<X extends Selection>(that: X): Selection.With<T, X> {
    return new Expr<Selection.Combine<T, X>>(
      ExprData.Merge(this[DATA], ExprData.create(that))
    )
  }

  /**
   * Dynamic expressions allow accessing runtime fields of JSON properties
   * through a Proxy.
   *
   * Expr.value({a: {b: 1}}).dynamic().a.b.is(1) // true
   **/
  dynamic<X = T>(...path: Array<string>): Fields<X> {
    return new Proxy<any>(
      (...args: Array<any>) => {
        const method = path[path.length - 1]
        const e: any =
          path.length > 1 ? this.get(path.slice(0, -1).join('.')) : this
        return e[method]?.apply(e, args)
      },
      {
        get: (_, key) => {
          const e: any = path.length > 0 ? this.get(path.join('.')) : this
          if (typeof key !== 'string') return e[key]
          return this.dynamic(...path, key)
        }
      }
    )
  }

  at<T>(this: Expr<Array<T>>, index: number): Expr<T | null> {
    return this.get(`[${Number(index)}]`)
  }

  includes<T>(this: Expr<Array<T>>, value: EV<T>): Expr<boolean> {
    return Expr.create(value).isIn(this)
  }

  filter<T>(
    this: Expr<Array<T>>,
    fn: (cursor: Fields<T>) => Expr<boolean>
  ): Expr<Array<T>> {
    const alias = `__${Math.random().toString(36).slice(2, 9)}`
    const target = Target.Expr(this[DATA], alias)
    return new Expr(
      ExprData.Filter(
        target,
        ExprData.create(fn(new Expr(ExprData.Row(target)).dynamic()))
      )
    )
  }

  map<T, X extends Selection>(
    this: Expr<Array<T>>,
    fn: (cursor: Fields<T>) => X
  ): Expr<Array<Selection.Infer<X>>> {
    const alias = `__${Math.random().toString(36).slice(2, 9)}`
    const target = Target.Expr(this[DATA], alias)
    return new Expr(
      ExprData.Map(
        target,
        ExprData.create(fn(new Expr(ExprData.Row(target)).dynamic()))
      )
    )
  }

  sure() {
    return this as Expr<NonNullable<T>>
  }

  get<T>(name: string): Expr<T> {
    return new Expr(ExprData.Field(this[DATA], name as string))
  }
}

export namespace Expr {
  export const Data: typeof DATA = DATA
  export const IsExpr: typeof IS_EXPR = IS_EXPR
  export const ToExpr: typeof TO_EXPR = TO_EXPR

  export const NULL = create(null)

  export function value<T>(value: T): Expr<T> {
    return new Expr<T>(ExprData.Param(ParamData.Value(value)))
  }

  export function create<T>(input: EV<T>): Expr<T> {
    if (isExpr(input)) return input
    return new Expr(ExprData.create(input))
  }

  export function and(...conditions: Array<EV<boolean>>): Expr<boolean> {
    return conditions
      .map(create)
      .reduce((condition, expr) => condition.and(expr), value(true))
  }

  export function or(...conditions: Array<EV<boolean>>): Expr<boolean> {
    return conditions
      .map(create)
      .reduce((condition, expr) => condition.or(expr), value(false))
  }

  export function isExpr<T>(input: any): input is Expr<T> {
    return (
      input !== null &&
      (typeof input === 'object' || typeof input === 'function') &&
      input[IS_EXPR]
    )
  }
}
