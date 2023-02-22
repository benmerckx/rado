import {Fields} from './Fields'
import {OrderBy, OrderDirection} from './OrderBy'
import {ParamData, ParamType} from './Param'
import {Query, QueryData} from './Query'
import {Selection} from './Selection'
import {Target} from './Target'

const DATA = Symbol('Expr.Data')
const TO_EXPR = Symbol('Expr.ToExpr')
const IS_EXPR = Symbol('Expr.IsExpr')

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
  export class UnOp {
    type = ExprType.UnOp as const
    constructor(public op: UnOpType, public expr: ExprData) {}
  }
  export class BinOp {
    type = ExprType.BinOp as const
    constructor(public op: BinOpType, public a: ExprData, public b: ExprData) {}
  }
  export class Field {
    type = ExprType.Field as const
    constructor(public expr: ExprData, public field: string) {}
  }
  export class Param {
    type = ExprType.Param as const
    constructor(public param: ParamData) {}
  }
  export class Call {
    type = ExprType.Call as const
    constructor(public method: string, public params: Array<ExprData>) {}
  }
  export class Query {
    type = ExprType.Query as const
    constructor(public query: QueryData.Select) {}
  }
  export class Record {
    type = ExprType.Record as const
    constructor(public fields: {[key: string]: ExprData}) {}
  }
  export class Merge {
    type = ExprType.Merge as const
    constructor(public a: ExprData, public b: ExprData) {}
  }
  export class Row {
    type = ExprType.Row as const
    constructor(public target: Target) {}
  }
  export class Map {
    type = ExprType.Map as const
    constructor(public target: Target, public result: ExprData) {}
  }
  export class Filter {
    type = ExprType.Filter as const
    constructor(public target: Target, public condition: ExprData) {}
  }
}

export namespace ExprData {
  export function create(input: any): ExprData {
    if (input === null || input === undefined)
      return new ExprData.Param(new ParamData.Value(null))
    if (
      input &&
      (typeof input === 'function' || typeof input === 'object') &&
      input[TO_EXPR]
    )
      input = input[TO_EXPR]()
    if (Expr.isExpr(input)) return input[DATA]
    if (input && typeof input === 'object' && !Array.isArray(input))
      return new ExprData.Record(
        fromEntries(
          entries(input).map(([key, value]) => [key, ExprData.create(value)])
        )
      )
    return new ExprData.Param(new ParamData.Value(input))
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
    return new Expr(new ExprData.UnOp(UnOpType.Not, this[DATA]))
  }

  or(this: Expr<boolean>, that: EV<boolean>): Expr<boolean> {
    const a = this
    const b = Expr.create(that)
    if (b.isConstant(true) || a.isConstant(false)) return b
    if (a.isConstant(true) || b.isConstant(false)) return this
    return new Expr(new ExprData.BinOp(BinOpType.Or, a[DATA], b[DATA]))
  }

  and(this: Expr<boolean>, that: EV<boolean>): Expr<boolean> {
    const a = this
    const b = Expr.create(that)
    if (b.isConstant(true) || a.isConstant(false)) return this
    if (a.isConstant(true) || b.isConstant(false)) return b
    return new Expr(new ExprData.BinOp(BinOpType.And, a[DATA], b[DATA]))
  }

  is(that: EV<T> | Query.SelectSingle<T>): Expr<boolean> {
    if (that === null || (Expr.isExpr(that) && that.isConstant(null)))
      return this.isNull()
    return new Expr(
      new ExprData.BinOp(BinOpType.Equals, this[DATA], ExprData.create(that))
    )
  }

  isConstant(value: T): boolean {
    switch (this[DATA].type) {
      case ExprType.Param:
        const param = this[DATA].param
        switch (param.type) {
          case ParamType.Value:
            return param.value === value
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
      new ExprData.BinOp(BinOpType.NotEquals, this[DATA], ExprData.create(that))
    )
  }

  isNull(): Expr<boolean> {
    return new Expr(new ExprData.UnOp(UnOpType.IsNull, this[DATA]))
  }

  isNotNull(): Expr<boolean> {
    return this.isNull().not()
  }

  isIn(that: EV<Array<T>> | Query.SelectMultiple<T>): Expr<boolean> {
    return new Expr(
      new ExprData.BinOp(BinOpType.In, this[DATA], ExprData.create(that))
    )
  }

  isNotIn(that: EV<Array<T>> | Query.SelectMultiple<T>): Expr<boolean> {
    return new Expr(
      new ExprData.BinOp(BinOpType.NotIn, this[DATA], ExprData.create(that))
    )
  }

  isGreater(that: EV<any>): Expr<boolean> {
    return new Expr(
      new ExprData.BinOp(BinOpType.Greater, this[DATA], ExprData.create(that))
    )
  }

  isGreaterOrEqual(that: EV<any>): Expr<boolean> {
    return new Expr(
      new ExprData.BinOp(
        BinOpType.GreaterOrEqual,
        this[DATA],
        ExprData.create(that)
      )
    )
  }

  isLess(that: EV<any>): Expr<boolean> {
    return new Expr(
      new ExprData.BinOp(BinOpType.Less, this[DATA], ExprData.create(that))
    )
  }

  isLessOrEqual(that: EV<any>): Expr<boolean> {
    return new Expr(
      new ExprData.BinOp(
        BinOpType.LessOrEqual,
        this[DATA],
        ExprData.create(that)
      )
    )
  }

  add(this: Expr<number>, that: EV<number>): Expr<number> {
    return new Expr(
      new ExprData.BinOp(BinOpType.Add, this[DATA], ExprData.create(that))
    )
  }

  substract(this: Expr<number>, that: EV<number>): Expr<number> {
    return new Expr(
      new ExprData.BinOp(BinOpType.Subt, this[DATA], ExprData.create(that))
    )
  }

  multiply(this: Expr<number>, that: EV<number>): Expr<number> {
    return new Expr(
      new ExprData.BinOp(BinOpType.Mult, this[DATA], ExprData.create(that))
    )
  }

  remainder(this: Expr<number>, that: EV<number>): Expr<number> {
    return new Expr(
      new ExprData.BinOp(BinOpType.Mod, this[DATA], ExprData.create(that))
    )
  }

  divide(this: Expr<number>, that: EV<number>): Expr<number> {
    return new Expr(
      new ExprData.BinOp(BinOpType.Div, this[DATA], ExprData.create(that))
    )
  }

  concat(this: Expr<string>, that: EV<string>): Expr<string> {
    return new Expr(
      new ExprData.BinOp(BinOpType.Concat, this[DATA], ExprData.create(that))
    )
  }

  like(this: Expr<string>, that: EV<string>): Expr<boolean> {
    return new Expr(
      new ExprData.BinOp(BinOpType.Like, this[DATA], ExprData.create(that))
    )
  }

  glob(this: Expr<string>, that: EV<string>): Expr<boolean> {
    return new Expr(
      new ExprData.BinOp(BinOpType.Glob, this[DATA], ExprData.create(that))
    )
  }

  match(this: Expr<string>, that: EV<string>): Expr<boolean> {
    return new Expr(
      new ExprData.BinOp(BinOpType.Match, this[DATA], ExprData.create(that))
    )
  }

  with<X extends Selection>(that: X): Selection.With<T, X> {
    return new Expr<Selection.Combine<T, X>>(
      new ExprData.Merge(this[DATA], ExprData.create(that))
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
      new ExprData.Filter(
        target,
        ExprData.create(fn(new Expr(new ExprData.Row(target)).dynamic()))
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
      new ExprData.Map(
        target,
        ExprData.create(fn(new Expr(new ExprData.Row(target)).dynamic()))
      )
    )
  }

  sure() {
    return this as Expr<NonNullable<T>>
  }

  get<T>(name: string): Expr<T> {
    return new Expr(new ExprData.Field(this[DATA], name as string))
  }
}

export namespace Expr {
  export const Data: typeof DATA = DATA
  export const IsExpr: typeof IS_EXPR = IS_EXPR
  export const ToExpr: typeof TO_EXPR = TO_EXPR

  export const NULL = create(null)

  export function value<T>(value: T): Expr<T> {
    return new Expr<T>(new ExprData.Param(new ParamData.Value(value)))
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
