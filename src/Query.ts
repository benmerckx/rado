import {ColumnData} from './Column'
import {ExprData} from './Expr'
import {OrderBy} from './OrderBy'
import {Index, Schema} from './Schema'
import {Target} from './Target'

export const enum QueryType {
  Insert = 'Insert',
  Select = 'Select',
  Update = 'Update',
  Delete = 'Delete',
  CreateTable = 'CreateTable',
  CreateIndex = 'CreateIndex',
  DropIndex = 'DropIndex',
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
  | Query.CreateIndex
  | Query.DropIndex
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
  export interface CreateIndex extends QueryBase {
    type: QueryType.CreateIndex
    table: Schema
    index: Index
    ifNotExists?: boolean
  }
  export function CreateIndex(
    create: Omit<CreateIndex, 'type'>
  ): Query.CreateIndex {
    return {type: QueryType.CreateIndex, ...create}
  }
  export interface DropIndex extends QueryBase {
    type: QueryType.DropIndex
    table: Schema
    index: Index
    ifExists?: boolean
  }
  export function DropIndex(drop: Omit<DropIndex, 'type'>): Query.DropIndex {
    return {type: QueryType.DropIndex, ...drop}
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
    if (raw.strings.some(chunk => chunk.includes('?')))
      throw new TypeError('SQL injection hazard')
    return {type: QueryType.Raw, ...raw}
  }
  export interface AlterTable extends QueryBase {
    type: QueryType.AlterTable
    table: Schema
    alterColumn?: ColumnData
    addColumn?: ColumnData
    dropColumn?: string
  }
  export function AlterTable(
    alter: Omit<AlterTable, 'type'>
  ): Query.AlterTable {
    return {type: QueryType.AlterTable, ...alter}
  }
}
