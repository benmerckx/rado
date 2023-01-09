import {ColumnData} from './Column'
import {ExprData} from './Expr'
import {Key} from './Key'
import {OrderBy} from './OrderBy'
import {Schema} from './Schema'
import {Target} from './Target'

export const enum QueryType {
  Insert = 'Insert',
  Select = 'Select',
  Update = 'Update',
  Delete = 'Delete',
  CreateTable = 'CreateTable',
  AlterTable = 'AlterTable',
  Batch = 'Batch',
  Transaction = 'Transaction',
  Raw = 'Raw'
}

export type Query<T = any> =
  | Query.Insert
  | Query.Select
  | Query.Update
  | Query.Delete
  | Query.CreateTable
  | Query.AlterTable
  | Query.Batch
  | Query.Transaction
  | Query.Raw

export namespace Query {
  export interface QueryBase {
    limit?: number
    offset?: number
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
    into: Schema
    data: Array<any>
  }
  export function Insert(insert: Omit<Insert, 'type'>): Query.Insert {
    return {type: QueryType.Insert, ...insert}
  }
  export interface Select extends QueryBase {
    type: QueryType.Select
    selection: ExprData
    from: Target
  }
  export function Select(select: Omit<Select, 'type'>): Query.Select {
    return {type: QueryType.Select, ...select}
  }
  export interface Update extends QueryBase {
    type: QueryType.Update
    table: Schema
    set?: Record<string, any>
  }
  export function Update(update: Omit<Update, 'type'>): Query.Update {
    return {type: QueryType.Update, ...update}
  }
  export interface Delete extends QueryBase {
    type: QueryType.Delete
    table: Schema
  }
  export function Delete(del: Omit<Delete, 'type'>): Query.Delete {
    return {type: QueryType.Delete, ...del}
  }
  export interface CreateTable extends QueryBase {
    type: QueryType.CreateTable
    table: Schema
    ifNotExists?: boolean
  }
  export function CreateTable(
    create: Omit<CreateTable, 'type'>
  ): Query.CreateTable {
    return {type: QueryType.CreateTable, ...create}
  }
  export interface Batch extends QueryBase {
    type: QueryType.Batch
    queries: Array<Query<any>>
  }
  export function Batch(batch: Omit<Batch, 'type'>): Query.Batch {
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
  export function Transaction(
    transaction: Omit<Transaction, 'type'>
  ): Query.Transaction {
    return {type: QueryType.Transaction, ...transaction}
  }
  export type RawReturn = 'row' | 'rows' | undefined
  export interface Raw extends QueryBase {
    type: QueryType.Raw
    expectedReturn?: 'row' | 'rows'
    strings: ReadonlyArray<string>
    params: Array<any>
  }
  export function Raw(raw: Omit<Raw, 'type'>): Query.Raw {
    return {type: QueryType.Raw, ...raw}
  }
  export interface AlterTable extends QueryBase {
    type: QueryType.AlterTable
    table: Schema
    alterColumn?: [to: ColumnData, from: ColumnData | undefined]
    addColumn?: ColumnData
    dropColumn?: ColumnData
    addKey?: Key
    dropKey?: Key
  }
  export function AlterTable(
    alter: Omit<AlterTable, 'type'>
  ): Query.AlterTable {
    return {type: QueryType.AlterTable, ...alter}
  }
}
