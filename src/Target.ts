import {CollectionData} from './Collection'
import {ExprData} from './Expr'

export const enum TargetType {
  Each,
  Collection,
  Join
}

export type Target = Target.Each | Target.Collection | Target.Join

export namespace Target {
  export interface Each {
    type: TargetType.Each
    expr: ExprData
    alias: string
  }
  export function Each(expr: ExprData, alias: string): Each {
    return {type: TargetType.Each, expr, alias}
  }
  export interface Collection {
    type: TargetType.Collection
    collection: CollectionData
  }
  export function Collection(collection: CollectionData): Collection {
    return {type: TargetType.Collection, collection}
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

  export function source(from: Target): string {
    switch (from.type) {
      case TargetType.Collection:
        return from.collection.alias || from.collection.name
      default:
        throw new Error(`Cannot determine source for ${from.type}`)
    }
  }
}
