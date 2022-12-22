import {CollectionData} from './Collection'
import {ExprData} from './Expr'
import {OrderBy} from './OrderBy'
import {Target} from './Target'

export const enum QueryType {
  Insert,
  Select,
  Update,
  Delete
}

export type Query<T = any> =
  | Query.Insert
  | Query.Select
  | Query.Update
  | Query.Delete

export namespace Query {
  export interface Limit {
    limit?: number
    offset?: number
  }
  export interface QueryBase extends Limit {
    selection?: ExprData
    where?: ExprData
    orderBy?: Array<OrderBy>
    groupBy?: Array<ExprData>
    having?: ExprData
  }
  export interface Insert extends QueryBase {
    type: QueryType.Insert
    into: CollectionData
    data: Array<any>
  }
  export function Insert<T>(insert: Omit<Insert, 'type'>): Query<T> {
    return {type: QueryType.Insert, ...insert}
  }
  export interface Select extends QueryBase {
    type: QueryType.Select
    from: Target
    singleResult?: boolean
  }
  export function Select<T>(select: Omit<Select, 'type'>): Query<T> {
    return {type: QueryType.Select, ...select}
  }
  export interface Update extends QueryBase {
    type: QueryType.Update
    collection: CollectionData
    set?: Record<string, any>
  }
  export function Update<T>(
    update: Omit<Update, 'type'>
  ): Query<{rowsAffected: number}> {
    return {type: QueryType.Update, ...update}
  }
  export interface Delete extends QueryBase {
    type: QueryType.Delete
    collection: CollectionData
  }
  export function Delete<T>(
    del: Omit<Delete, 'type'>
  ): Query<{rowsAffected: number}> {
    return {type: QueryType.Delete, ...del}
  }
}
