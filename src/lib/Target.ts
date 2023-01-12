import {ExprData} from './Expr'
import {Schema} from './Schema'

export enum TargetType {
  Each = 'Each',
  Table = 'Table',
  Join = 'Join'
}

export type Target = Target.Each | Target.Table | Target.Join

export namespace Target {
  export interface Each {
    type: TargetType.Each
    expr: ExprData
    alias: string
  }
  export function Each(expr: ExprData, alias: string): Each {
    return {type: TargetType.Each, expr, alias}
  }
  export interface Table {
    type: TargetType.Table
    table: Schema
  }
  export function Table(table: Schema): Table {
    return {type: TargetType.Table, table: table}
  }
  export interface Join {
    type: TargetType.Join
    left: Target
    right: Target
    joinType: 'left' | 'inner'
    on: ExprData
  }
  export function Join(
    left: Target,
    right: Target,
    joinType: 'left' | 'inner',
    on: ExprData
  ): Join {
    return {type: TargetType.Join, left, right, joinType, on}
  }

  export function source(from: Target): Schema | undefined {
    switch (from.type) {
      case TargetType.Table:
        return from.table
      case TargetType.Join:
        return source(from.left)
      default:
        return undefined
    }
  }
}
