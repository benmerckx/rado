import {Cursor} from './Cursor'
import {Fields} from './Fields'
import {OrderBy, OrderDirection} from './OrderBy'
import {ParamData, ParamType} from './Param'
import {Query} from './Query'
import {Selection} from './Selection'
import {Target} from './Target'

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
  Merge = 'Merge',
  Case = 'Case'
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
  | ExprData.Case

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
  export type Query = {type: ExprType.Query; query: Query.Select}
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
  export type Case = {
    type: ExprType.Case
    expr: ExprData
    cases: {[key: string]: ExprData}
    defaultCase?: ExprData
  }
}

export const ExprData = {
  UnOp(op: UnOpType, expr: ExprData): ExprData {
    return {type: ExprType.UnOp, op, expr}
  },
  BinOp(op: BinOpType, a: ExprData, b: ExprData): ExprData {
    return {type: ExprType.BinOp, op, a, b}
  },
  Field(expr: ExprData, field: string): ExprData {
    return {type: ExprType.Field, expr, field}
  },
  Param(param: ParamData): ExprData {
    return {type: ExprType.Param, param}
  },
  Call(method: string, params: Array<ExprData>): ExprData {
    return {type: ExprType.Call, method, params}
  },
  Query(query: Query.Select): ExprData {
    return {type: ExprType.Query, query}
  },
  Record(fields: Record<string, ExprData>): ExprData {
    return {type: ExprType.Record, fields}
  },
  Merge(a: ExprData, b: ExprData): ExprData {
    return {type: ExprType.Merge, a, b}
  },
  Row(target: Target): ExprData {
    return {type: ExprType.Row, target}
  },
  Map(target: Target, result: ExprData): ExprData {
    return {type: ExprType.Map, target, result}
  },
  Filter(target: Target, condition: ExprData): ExprData {
    return {type: ExprType.Filter, target, condition}
  },
  Case(
    expr: ExprData,
    cases: Record<string, ExprData>,
    defaultCase?: ExprData
  ): ExprData {
    return {type: ExprType.Case, expr, cases, defaultCase}
  },
  create(input: any): ExprData {
    if (input === null || input === undefined)
      return ExprData.Param(ParamData.Value(null))
    if (
      input &&
      (typeof input === 'function' || typeof input === 'object') &&
      input[Expr.toExpr]
    )
      input = input[Expr.toExpr]()
    if (Expr.isExpr(input)) return input.expr
    if (input && typeof input === 'object' && !Array.isArray(input))
      return ExprData.Record(
        fromEntries(
          entries(input).map(([key, value]) => [key, ExprData.create(value)])
        )
      )
    return ExprData.Param(ParamData.Value(input))
  }
}

const toExpr = ExprData.create

/** Expression or value of type T */
export type EV<T> = Expr<T> | T

const IsExpr = Symbol('isExpr')

export class Expr<T> {
  constructor(public expr: ExprData) {}

  [IsExpr] = true

  asc(): OrderBy {
    return {expr: this.expr, order: OrderDirection.Asc}
  }

  desc(): OrderBy {
    return {expr: this.expr, order: OrderDirection.Desc}
  }

  not(): Expr<boolean> {
    return new Expr(ExprData.UnOp(UnOpType.Not, this.expr))
  }

  or(this: Expr<boolean>, that: EV<boolean>): Expr<boolean> {
    const a = this
    const b = Expr.create(that)
    if (b.isConstant(true) || a.isConstant(false)) return b
    if (a.isConstant(true) || b.isConstant(false)) return this
    return new Expr(ExprData.BinOp(BinOpType.Or, a.expr, b.expr))
  }

  and(this: Expr<boolean>, that: EV<boolean>): Expr<boolean> {
    const a = this
    const b = Expr.create(that)
    if (b.isConstant(true) || a.isConstant(false)) return this
    if (a.isConstant(true) || b.isConstant(false)) return b
    return new Expr(ExprData.BinOp(BinOpType.And, a.expr, b.expr))
  }

  is(that: EV<T> | Cursor.SelectSingle<T>): Expr<boolean> {
    if (that === null || (Expr.isExpr(that) && that.isConstant(null)))
      return this.isNull()
    return new Expr(ExprData.BinOp(BinOpType.Equals, this.expr, toExpr(that)))
  }

  isConstant(value: T): boolean {
    switch (this.expr.type) {
      case ExprType.Param:
        switch (this.expr.param.type) {
          case ParamType.Value:
            return this.expr.param.value === value
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
      ExprData.BinOp(BinOpType.NotEquals, this.expr, toExpr(that))
    )
  }

  isNull(): Expr<boolean> {
    return new Expr(ExprData.UnOp(UnOpType.IsNull, this.expr))
  }

  isNotNull(): Expr<boolean> {
    return this.isNull().not()
  }

  isIn(that: EV<Array<T>> | Cursor.SelectMultiple<T>): Expr<boolean> {
    return new Expr(ExprData.BinOp(BinOpType.In, this.expr, toExpr(that)))
  }

  isNotIn(that: EV<Array<T>> | Cursor.SelectMultiple<T>): Expr<boolean> {
    return new Expr(ExprData.BinOp(BinOpType.NotIn, this.expr, toExpr(that)))
  }

  isGreater(that: EV<any>): Expr<boolean> {
    return new Expr(ExprData.BinOp(BinOpType.Greater, this.expr, toExpr(that)))
  }

  isGreaterOrEqual(that: EV<any>): Expr<boolean> {
    return new Expr(
      ExprData.BinOp(BinOpType.GreaterOrEqual, this.expr, toExpr(that))
    )
  }

  isLess(that: EV<any>): Expr<boolean> {
    return new Expr(ExprData.BinOp(BinOpType.Less, this.expr, toExpr(that)))
  }

  isLessOrEqual(that: EV<any>): Expr<boolean> {
    return new Expr(
      ExprData.BinOp(BinOpType.LessOrEqual, this.expr, toExpr(that))
    )
  }

  add(this: Expr<number>, that: EV<number>): Expr<number> {
    return new Expr(ExprData.BinOp(BinOpType.Add, this.expr, toExpr(that)))
  }

  substract(this: Expr<number>, that: EV<number>): Expr<number> {
    return new Expr(ExprData.BinOp(BinOpType.Subt, this.expr, toExpr(that)))
  }

  multiply(this: Expr<number>, that: EV<number>): Expr<number> {
    return new Expr(ExprData.BinOp(BinOpType.Mult, this.expr, toExpr(that)))
  }

  remainder(this: Expr<number>, that: EV<number>): Expr<number> {
    return new Expr(ExprData.BinOp(BinOpType.Mod, this.expr, toExpr(that)))
  }

  divide(this: Expr<number>, that: EV<number>): Expr<number> {
    return new Expr(ExprData.BinOp(BinOpType.Div, this.expr, toExpr(that)))
  }

  concat(this: Expr<string>, that: EV<string>): Expr<string> {
    return new Expr(ExprData.BinOp(BinOpType.Concat, this.expr, toExpr(that)))
  }

  like(this: Expr<string>, that: EV<string>): Expr<boolean> {
    return new Expr(ExprData.BinOp(BinOpType.Like, this.expr, toExpr(that)))
  }

  glob(this: Expr<string>, that: EV<string>): Expr<boolean> {
    return new Expr(ExprData.BinOp(BinOpType.Glob, this.expr, toExpr(that)))
  }

  match(this: Expr<string>, that: EV<string>): Expr<boolean> {
    return new Expr(ExprData.BinOp(BinOpType.Match, this.expr, toExpr(that)))
  }

  with<X extends Selection>(that: X): Selection.With<T, X> {
    return new Expr<Selection.Combine<T, X>>(
      ExprData.Merge(this.expr, ExprData.create(that))
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
        const method = path.pop()!
        const e: Record<string, any> =
          path.length > 0 ? this.get(path.join('.')) : this
        return e[method]?.apply(e, args)
      },
      {
        get: (_, key: string) => {
          const e = path.length > 0 ? this.get(path.join('.')) : this
          // Todo: expr should be replaced by a Symbol
          if (key === 'expr') return e.expr
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
    const target = Target.Expr(this.expr, alias)
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
    const target = Target.Expr(this.expr, alias)
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
    return new Expr(ExprData.Field(this.expr, name as string))
  }
}

export namespace Expr {
  export const NULL = create(null)
  export const toExpr = Symbol('toExpr')

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
      input[IsExpr]
    )
  }
}
