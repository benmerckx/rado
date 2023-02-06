import {ExprData} from './Expr'
import {Query as QueryData} from './Query'
import {Schema} from './Schema'

export enum TargetType {
  Expr = 'Expr',
  Query = 'Query',
  Table = 'Table',
  Join = 'Join'
}

export type Target = Target.Expr | Target.Query | Target.Table | Target.Join

export namespace Target {
  export interface Expr {
    type: TargetType.Expr
    expr: ExprData
    alias?: string
  }
  export function Expr(expr: ExprData, alias?: string): Expr {
    return {type: TargetType.Expr, expr, alias}
  }
  export interface Query {
    type: TargetType.Query
    query: QueryData
    alias?: string
  }
  export function Query(query: QueryData, alias?: string): Query {
    return {type: TargetType.Query, query, alias}
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
