import {CollectionData} from './Collection'
import {ExprData} from './Expr'
import {OrderBy} from './OrderBy'
import {Target} from './Target'

export const enum QueryType {
  Insert = 'Insert',
  Select = 'Select',
  Update = 'Update',
  Delete = 'Delete',
  CreateTable = 'CreateTable',
  Batch = 'Batch',
  Transaction = 'Transaction'
}

export type Query<T = any> =
  | Query.Insert
  | Query.Select
  | Query.Update
  | Query.Delete
  | Query.CreateTable
  | Query.Batch
  | Query.Transaction

export namespace Query {
  export function Transaction<T>(
    transaction: Omit<Transaction, 'type'>
  ): Query<T> {
    return {type: QueryType.Transaction, ...transaction}
  }
  export interface Limit {
    limit?: number
    offset?: number
  }
  export interface QueryBase extends Limit {
    type: QueryType
    where?: ExprData
    orderBy?: Array<OrderBy>
    groupBy?: Array<ExprData>
    having?: ExprData
    selection?: ExprData
    singleResult?: boolean
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
    selection: ExprData
    from: Target
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
  export interface CreateTable extends QueryBase {
    type: QueryType.CreateTable
    collection: CollectionData
    ifNotExists?: boolean
  }
  export function CreateTable<T>(
    create: Omit<CreateTable, 'type'>
  ): Query<void> {
    return {type: QueryType.CreateTable, ...create}
  }
  export interface Batch extends QueryBase {
    type: QueryType.Batch
    queries: Array<Query<any>>
  }
  export function Batch<T>(batch: Omit<Batch, 'type'>): Query<void> {
    return {type: QueryType.Batch, ...batch}
  }
  export enum TransactionOperation {
    Begin = 'Begin',
    Commit = 'Commit',
    Rollback = 'Rollback'
  }
  export interface Transaction extends QueryBase {
    type: QueryType.Transaction
    id: string
    op: TransactionOperation
  }
}
