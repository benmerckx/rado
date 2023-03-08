import {Driver} from '../lib/Driver.js'
import {CompileOptions} from '../lib/Formatter.js'
import {ColumnData} from './Column.js'
import {EV, Expr, ExprData} from './Expr.js'
import {IndexData} from './Index.js'
import {OrderBy} from './OrderBy.js'
import {Selection} from './Selection.js'
import {TableData} from './Table.js'
import {Target} from './Target.js'

const {assign} = Object

export enum QueryType {
  Insert = 'QueryData.Insert',
  Select = 'QueryData.Select',
  Union = 'QueryData.Union',
  Update = 'QueryData.Update',
  Delete = 'QueryData.Delete',
  CreateTable = 'QueryData.CreateTable',
  AlterTable = 'QueryData.AlterTable',
  DropTable = 'QueryData.DropTable',
  CreateIndex = 'QueryData.CreateIndex',
  DropIndex = 'QueryData.DropIndex',
  Batch = 'QueryData.Batch',
  Transaction = 'QueryData.Transaction',
  Raw = 'QueryData.Raw'
}

export type QueryData =
  | QueryData.Insert
  | QueryData.Select
  | QueryData.Union
  | QueryData.Update
  | QueryData.Delete
  | QueryData.CreateTable
  | QueryData.AlterTable
  | QueryData.DropTable
  | QueryData.CreateIndex
  | QueryData.DropIndex
  | QueryData.Batch
  | QueryData.Transaction
  | QueryData.Raw

export namespace QueryData {
  abstract class Data<T> {
    abstract type: QueryType
    declare limit?: number
    declare offset?: number
    declare where?: ExprData
    declare orderBy?: Array<OrderBy>
    declare groupBy?: Array<ExprData>
    declare having?: ExprData
    declare selection?: ExprData
    declare singleResult?: boolean
    declare validate?: boolean
    constructor(data: Omit<T, 'type' | 'with'>) {
      assign(this, data)
    }
    with(data: Partial<T>) {
      return new (this.constructor as any)({...this, ...data})
    }
  }

  export enum UnionOperation {
    Union = 'Union',
    UnionAll = 'UnionAll',
    Intersect = 'Intersect',
    Except = 'Except'
  }
  export class Union extends Data<Union> {
    type = QueryType.Union as const
    declare a: Select | Union
    declare operator: UnionOperation
    declare b: Select | Union | (() => Select | Union)
  }
  export class Select extends Data<Select> {
    type = QueryType.Select as const
    declare selection: ExprData
    declare from?: Target
    declare union?: Select
    declare unionAll?: Select
    declare intersect?: Select
    declare except?: Select
  }
  export class Insert extends Data<Insert> {
    type = QueryType.Insert as const
    declare into: TableData
    declare data?: Array<any>
    declare select?: QueryData.Select
  }
  export class Update extends Data<Update> {
    type = QueryType.Update as const
    declare table: TableData
    declare set?: Record<string, any>
  }
  export class Delete extends Data<Delete> {
    type = QueryType.Delete as const
    declare table: TableData
  }
  export class CreateTable extends Data<CreateTable> {
    type = QueryType.CreateTable as const
    declare table: TableData
    declare ifNotExists?: boolean
  }
  export class AlterTable extends Data<AlterTable> {
    type = QueryType.AlterTable as const
    declare table: TableData
    declare alterColumn?: ColumnData
    declare renameColumn?: {from: string; to: string}
    declare addColumn?: ColumnData
    declare dropColumn?: string
    declare renameTable?: {from: string}
  }
  export class DropTable extends Data<DropTable> {
    type = QueryType.DropTable as const
    declare table: TableData
    declare ifExists?: boolean
  }
  export class CreateIndex extends Data<CreateIndex> {
    type = QueryType.CreateIndex as const
    declare table: TableData
    declare index: IndexData
    declare ifNotExists?: boolean
  }
  export class DropIndex extends Data<DropIndex> {
    type = QueryType.DropIndex as const
    declare table: TableData
    declare name: string
    declare ifExists?: boolean
  }
  export class Batch extends Data<Batch> {
    type = QueryType.Batch as const
    declare queries: Array<QueryData>
  }
  export enum TransactionOperation {
    Begin = 'Begin',
    Commit = 'Commit',
    Rollback = 'Rollback'
  }
  export class Transaction extends Data<Transaction> {
    type = QueryType.Transaction as const
    declare id: string
    declare op: TransactionOperation
  }
  export type RawReturn = 'row' | 'rows' | undefined
  export class Raw extends Data<Raw> {
    type = QueryType.Raw as const
    declare expectedReturn?: 'row' | 'rows'
    declare strings: ReadonlyArray<string>
    declare params: Array<any>
    constructor(data: Omit<Raw, 'type' | 'with'>) {
      if (data.strings.some(chunk => chunk.includes('?')))
        throw new TypeError('SQL injection hazard')
      super(data)
    }
  }
}

export interface Query<T> {
  [Query.Data]: QueryData
}

export class Query<T> {
  declare [Selection.CursorType]: () => T

  constructor(query: QueryData) {
    this[Query.Data] = query
  }

  next<T>(cursor: Query<T>): Query<T> {
    return new Query<T>(
      new QueryData.Batch(
        this[Query.Data].with({
          queries: [this[Query.Data], cursor[Query.Data]]
        })
      )
    )
  }

  on(driver: Driver.Sync): T
  on(driver: Driver.Async): Promise<T>
  on(driver: Driver): T | Promise<T> {
    return driver.executeQuery(this[Query.Data]) as any
  }

  toSql(driver: Driver, options: CompileOptions = {forceInline: true}) {
    return driver.formatter.compile(this[Query.Data], options).sql
  }

  toJSON() {
    return this[Query.Data]
  }

  protected addWhere(where: Array<EV<boolean>>): this[typeof Query.Data] {
    const query = this[Query.Data]
    const conditions: Array<any> = where.slice()
    if (query.where) conditions.push(new Expr(query.where))
    return query.with({where: Expr.and(...conditions)[Expr.Data]})
  }
}

export namespace Query {
  export const Data = Symbol('Query.Data')

  export function isQuery<T>(input: any): input is Query<T> {
    return input !== null && Boolean(Query.Data in input)
  }
}
