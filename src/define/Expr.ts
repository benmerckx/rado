import {randomAlias} from '../util/Alias.js'
import {Fields} from './Fields.js'
import {OrderBy, OrderDirection} from './OrderBy.js'
import {ParamData, ParamType} from './Param.js'
import {QueryData, Select, SelectFirst} from './Query.js'
import {Selection} from './Selection.js'
import {Target} from './Target.js'

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
  UnOp = 'ExprData.UnOp',
  BinOp = 'ExprData.BinOp',
  Field = 'ExprData.Field',
  Param = 'ExprData.Param',
  Call = 'ExprData.Call',
  Query = 'ExprData.Query',
  Record = 'ExprData.Record',
  Row = 'ExprData.Row',
  Map = 'ExprData.Map',
  Filter = 'ExprData.Filter',
  Merge = 'ExprData.Merge'
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

  export function create(input: any): ExprData {
    if (input === null || input === undefined)
      return new ExprData.Param(new ParamData.Value(null))
    if (Expr.hasExpr(input)) input = input[Expr.ToExpr]()
    if (Expr.isExpr(input)) return input[Expr.Data]
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

// Defined separately to avoid TypeScript going nuts about the symbols being
// used before they are defined
export interface Expr<T> {
  [Expr.Data]: ExprData
  [Expr.IsExpr]: boolean
}

export class Expr<T> {
  constructor(expr: ExprData) {
    this[Expr.Data] = expr
    this[Expr.IsExpr] = true
  }

  asc(): OrderBy {
    return {expr: this[Expr.Data], order: OrderDirection.Asc}
  }

  desc(): OrderBy {
    return {expr: this[Expr.Data], order: OrderDirection.Desc}
  }

  not(): Expr<boolean> {
    return new Expr(new ExprData.UnOp(UnOpType.Not, this[Expr.Data]))
  }

  or(this: Expr<boolean>, that: EV<boolean>): Expr<boolean> {
    const a = this
    const b = Expr.create(that)
    if (b.isConstant(true) || a.isConstant(false)) return b
    if (a.isConstant(true) || b.isConstant(false)) return this
    return new Expr(
      new ExprData.BinOp(BinOpType.Or, a[Expr.Data], b[Expr.Data])
    )
  }

  and(this: Expr<boolean>, that: EV<boolean>): Expr<boolean> {
    const a = this
    const b = Expr.create(that)
    if (b.isConstant(true) || a.isConstant(false)) return this
    if (a.isConstant(true) || b.isConstant(false)) return b
    return new Expr(
      new ExprData.BinOp(BinOpType.And, a[Expr.Data], b[Expr.Data])
    )
  }

  is(that: EV<T> | SelectFirst<T>): Expr<boolean> {
    if (that === null || (Expr.isExpr(that) && that.isConstant(null)))
      return this.isNull()
    return new Expr(
      new ExprData.BinOp(
        BinOpType.Equals,
        this[Expr.Data],
        ExprData.create(that)
      )
    )
  }

  isConstant(value: T): boolean {
    const expr = this[Expr.Data]
    switch (expr.type) {
      case ExprType.Param:
        const param = expr.param
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
      new ExprData.BinOp(
        BinOpType.NotEquals,
        this[Expr.Data],
        ExprData.create(that)
      )
    )
  }

  isNull(): Expr<boolean> {
    return new Expr(new ExprData.UnOp(UnOpType.IsNull, this[Expr.Data]))
  }

  isNotNull(): Expr<boolean> {
    return this.isNull().not()
  }

  isIn(that: EV<Array<T>> | Select<T>): Expr<boolean> {
    return new Expr(
      new ExprData.BinOp(BinOpType.In, this[Expr.Data], ExprData.create(that))
    )
  }

  isNotIn(that: EV<Array<T>> | Select<T>): Expr<boolean> {
    return new Expr(
      new ExprData.BinOp(
        BinOpType.NotIn,
        this[Expr.Data],
        ExprData.create(that)
      )
    )
  }

  isGreater(that: EV<any>): Expr<boolean> {
    return new Expr(
      new ExprData.BinOp(
        BinOpType.Greater,
        this[Expr.Data],
        ExprData.create(that)
      )
    )
  }

  isGreaterOrEqual(that: EV<any>): Expr<boolean> {
    return new Expr(
      new ExprData.BinOp(
        BinOpType.GreaterOrEqual,
        this[Expr.Data],
        ExprData.create(that)
      )
    )
  }

  isLess(that: EV<any>): Expr<boolean> {
    return new Expr(
      new ExprData.BinOp(BinOpType.Less, this[Expr.Data], ExprData.create(that))
    )
  }

  isLessOrEqual(that: EV<any>): Expr<boolean> {
    return new Expr(
      new ExprData.BinOp(
        BinOpType.LessOrEqual,
        this[Expr.Data],
        ExprData.create(that)
      )
    )
  }

  add(this: Expr<number>, that: EV<number>): Expr<number> {
    return new Expr(
      new ExprData.BinOp(BinOpType.Add, this[Expr.Data], ExprData.create(that))
    )
  }

  subtract(this: Expr<number>, that: EV<number>): Expr<number> {
    return new Expr(
      new ExprData.BinOp(BinOpType.Subt, this[Expr.Data], ExprData.create(that))
    )
  }

  multiply(this: Expr<number>, that: EV<number>): Expr<number> {
    return new Expr(
      new ExprData.BinOp(BinOpType.Mult, this[Expr.Data], ExprData.create(that))
    )
  }

  remainder(this: Expr<number>, that: EV<number>): Expr<number> {
    return new Expr(
      new ExprData.BinOp(BinOpType.Mod, this[Expr.Data], ExprData.create(that))
    )
  }

  divide(this: Expr<number>, that: EV<number>): Expr<number> {
    return new Expr(
      new ExprData.BinOp(BinOpType.Div, this[Expr.Data], ExprData.create(that))
    )
  }

  concat(this: Expr<string>, that: EV<string>): Expr<string> {
    return new Expr(
      new ExprData.BinOp(
        BinOpType.Concat,
        this[Expr.Data],
        ExprData.create(that)
      )
    )
  }

  like(this: Expr<string>, that: EV<string>): Expr<boolean> {
    return new Expr(
      new ExprData.BinOp(BinOpType.Like, this[Expr.Data], ExprData.create(that))
    )
  }

  glob(this: Expr<string>, that: EV<string>): Expr<boolean> {
    return new Expr(
      new ExprData.BinOp(BinOpType.Glob, this[Expr.Data], ExprData.create(that))
    )
  }

  match(this: Expr<string>, that: EV<string>): Expr<boolean> {
    return new Expr(
      new ExprData.BinOp(
        BinOpType.Match,
        this[Expr.Data],
        ExprData.create(that)
      )
    )
  }

  with<X extends Selection>(that: X): Selection.With<T, X> {
    return new Expr<Selection.Combine<T, X>>(
      new ExprData.Merge(this[Expr.Data], ExprData.create(that))
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
    const alias = randomAlias()
    const target = new Target.Expr(this[Expr.Data], alias)
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
    const alias = randomAlias()
    const target = new Target.Expr(this[Expr.Data], alias)
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
    switch (this[Expr.Data].type) {
      case ExprType.Record:
        if (name in this[Expr.Data].fields)
          return new Expr(this[Expr.Data].fields[name])
      default:
        return new Expr(new ExprData.Field(this[Expr.Data], name as string))
    }
  }

  static [Symbol.hasInstance](instance: any) {
    return instance?.[Expr.IsExpr]
  }
}

export interface ObjectExpr {
  [Expr.Data]: ExprData
}

export namespace Expr {
  export const Data = Symbol('Expr.Data')
  export const IsExpr = Symbol('Expr.IsExpr')
  export const ToExpr = Symbol('Expr.ToExpr')
  export const NULL = create(null)

  export function value<T>(value: T, inline = false): Expr<T> {
    if (isExpr<T>(value)) return value
    return new Expr<T>(new ExprData.Param(new ParamData.Value(value, inline)))
  }

  export function get<T = any>(expr: ObjectExpr, field: string) {
    return new Expr<T>(new ExprData.Field(expr[Data], field))
  }

  export function create<T>(input: EV<T>): Expr<T> {
    if (isExpr<T>(input)) return input
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

  export function hasExpr<T>(input: any): input is {[Expr.ToExpr](): Expr<T>} {
    return (
      input &&
      (typeof input === 'function' || typeof input === 'object') &&
      input[Expr.ToExpr]
    )
  }

  export function isExpr<T>(input: any): input is Expr<T> {
    return input instanceof Expr
  }
}
