import {ExprData} from './Expr'
import {QueryData} from './Query'
import {TableData} from './Table'

export enum TargetType {
  Expr = 'Target.Expr',
  Query = 'Target.Query',
  Table = 'Target.Table',
  Join = 'Target.Join'
}

export type Target = Target.Expr | Target.Query | Target.Table | Target.Join

export namespace Target {
  export class Expr {
    type = TargetType.Expr as const
    constructor(public expr: ExprData, public alias?: string) {}
  }
  export class Query {
    type = TargetType.Query as const
    constructor(public query: QueryData, public alias?: string) {}
  }
  export class Table {
    type = TargetType.Table as const
    constructor(public table: TableData) {}
  }
  export class Join {
    type = TargetType.Join as const
    constructor(
      public left: Target,
      public right: Target,
      public joinType: 'left' | 'inner',
      public on: ExprData
    ) {}
  }

  export function source(from: Target): TableData | undefined {
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
