import {Cursor} from './Cursor'
import {OrderBy, OrderDirection} from './OrderBy'
import {ParamData, ParamType} from './Param'
import {Query} from './Query'
import {Selection} from './Selection'
import {Target} from './Target'

export const enum UnOp {
  Not = 'Not',
  IsNull = 'IsNull'
}

export const enum BinOp {
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

export const enum ExprType {
  UnOp = 'UnOp',
  BinOp = 'BinOp',
  Field = 'Field',
  Param = 'Param',
  Call = 'Call',
  Query = 'Query',
  Record = 'Record',
  Row = 'Row',
  Merge = 'Merge',
  Case = 'Case'
}

export type ExprData =
  | {type: ExprType.UnOp; op: UnOp; expr: ExprData}
  | {type: ExprType.BinOp; op: BinOp; a: ExprData; b: ExprData}
  | {type: ExprType.Field; expr: ExprData; field: string}
  | {type: ExprType.Param; param: ParamData}
  | {type: ExprType.Call; method: string; params: Array<ExprData>}
  | {type: ExprType.Query; query: Query.Select}
  | {type: ExprType.Record; fields: Record<string, ExprData>}
  | {type: ExprType.Merge; a: ExprData; b: ExprData}
  | {type: ExprType.Row; target: Target}
  | {
      type: ExprType.Case
      expr: ExprData
      cases: Record<string, ExprData>
      defaultCase?: ExprData
    }

export const ExprData = {
  UnOp(op: UnOp, expr: ExprData): ExprData {
    return {type: ExprType.UnOp, op, expr}
  },
  BinOp(op: BinOp, a: ExprData, b: ExprData): ExprData {
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
      typeof input === 'object' &&
      typeof input.toExpr === 'function'
    )
      input = input.toExpr()
    if (input instanceof Expr) return input.expr
    if (input && typeof input === 'object' && !Array.isArray(input))
      return ExprData.Record(
        Object.fromEntries(
          Object.entries(input).map(([key, value]) => [
            key,
            ExprData.create(value)
          ])
        )
      )
    return ExprData.Param(ParamData.Value(input))
  }
}

const toExpr = ExprData.create

/** Expression or value of type T */
export type EV<T> = Expr<T> | T

function isConstant<T>(e: ExprData, value: T): boolean {
  switch (e.type) {
    case ExprType.Param:
      switch (e.param.type) {
        case ParamType.Value:
          return e.param.value == value
        default:
          return false
      }
    default:
      return false
  }
}

export class Expr<T> {
  static NULL = toExpr(null)

  static value<T>(value: T): Expr<T> {
    return new Expr<T>(ExprData.Param(ParamData.Value(value)))
  }

  constructor(public expr: ExprData) {
    return new Proxy(this, {
      get(target: any, key) {
        return key in target ? target[key] : target.get(key)
      }
    })
  }

  asc(): OrderBy {
    return {expr: this.expr, order: OrderDirection.Asc}
  }

  desc(): OrderBy {
    return {expr: this.expr, order: OrderDirection.Desc}
  }

  not(): Expr<boolean> {
    return unop(this, UnOp.Not)
  }

  or(this: Expr<boolean>, that: EV<boolean>): Expr<boolean> {
    const a = this.expr
    const b = toExpr(that)
    if (isConstant(b, true) || isConstant(a, false)) return new Expr(b)
    if (isConstant(a, true) || isConstant(b, false)) return this
    return new Expr(ExprData.BinOp(BinOp.Or, a, b))
  }

  and(this: Expr<boolean>, that: EV<boolean>): Expr<boolean> {
    const a = this.expr
    const b = toExpr(that)
    if (isConstant(b, true) || isConstant(a, false)) return this
    if (isConstant(a, true) || isConstant(b, false)) return new Expr(b)
    return new Expr(ExprData.BinOp(BinOp.And, a, b))
  }

  isNull(): Expr<boolean> {
    return unop(this, UnOp.IsNull)
  }
  isNotNull(): Expr<boolean> {
    return this.isNull().not()
  }
  isNot(that: EV<T>): Expr<boolean> {
    if (that == null || (that instanceof Expr && isConstant(that.expr, null)))
      return this.isNotNull()
    return binop(this, BinOp.NotEquals, that)
  }
  is(that: EV<T> | Cursor.SelectSingle<T>): Expr<boolean> {
    if (that === null || (that instanceof Expr && isConstant(that.expr, null)))
      return this.isNull()
    return binop(this, BinOp.Equals, that)
  }
  isIn(that: EV<Array<T>> | Cursor<T>): Expr<boolean> {
    return binop(this, BinOp.In, that)
  }
  isNotIn(that: EV<Array<T>> | Cursor<T>): Expr<boolean> {
    return binop(this, BinOp.NotIn, that)
  }
  add(this: Expr<number>, that: EV<number>): Expr<number> {
    return binop(this, BinOp.Add, that)
  }
  substract(this: Expr<number>, that: EV<number>): Expr<number> {
    return binop(this, BinOp.Subt, that)
  }
  multiply(this: Expr<number>, that: EV<number>): Expr<number> {
    return binop(this, BinOp.Mult, that)
  }
  remainder(this: Expr<number>, that: EV<number>): Expr<number> {
    return binop(this, BinOp.Mod, that)
  }
  divide(this: Expr<number>, that: EV<number>): Expr<number> {
    return binop(this, BinOp.Div, that)
  }
  greater(that: EV<any>): Expr<boolean> {
    return binop(this, BinOp.Greater, that)
  }
  greaterOrEqual(that: EV<any>): Expr<boolean> {
    return binop(this, BinOp.GreaterOrEqual, that)
  }
  less(that: EV<any>): Expr<boolean> {
    return binop(this, BinOp.Less, that)
  }
  lessOrEqual(that: EV<any>): Expr<boolean> {
    return binop(this, BinOp.LessOrEqual, that)
  }
  concat(this: Expr<string>, that: EV<string>): Expr<string> {
    return binop(this, BinOp.Concat, that)
  }
  like(this: Expr<string>, that: EV<string>): Expr<boolean> {
    return binop(this, BinOp.Like, that)
  }
  glob(this: Expr<string>, that: EV<string>): Expr<boolean> {
    return binop(this, BinOp.Glob, that)
  }
  match(this: Expr<string>, that: EV<string>): Expr<boolean> {
    return binop(this, BinOp.Match, that)
  }
  with<X extends Selection>(that: X): Selection.With<T, X> {
    return new Expr<Selection.Combine<T, X>>(
      ExprData.Merge(this.expr, ExprData.create(that))
    )
  }
  private static uniqueId = 0
  private __id() {
    return `__id${Expr.uniqueId++}`
  }
  at<T>(this: Expr<Array<T>>, index: number): Expr<T | null> {
    return this.get(`[${Number(index)}]`)
  }
  sure() {
    return this as Expr<NonNullable<T>>
  }
  get<T>(name: string): Expr<T> {
    return new Expr(ExprData.Field(this.expr, name as string))
  }

  static create<T>(input: EV<T>): Expr<T> {
    if (input instanceof Expr) return input
    return new Expr(ExprData.create(input))
  }
}

function unop<This, Res>(self: Expr<This>, type: UnOp) {
  return new Expr<Res>(ExprData.UnOp(type, self.expr))
}

function binop<This, That, Res>(self: Expr<This>, type: BinOp, that: That) {
  return new Expr<Res>(ExprData.BinOp(type, self.expr, toExpr(that)))
}
