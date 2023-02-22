import {Driver} from '../lib/Driver'
import {CompileOptions} from '../lib/Formatter'
import {ColumnData} from './Column'
import {EV, Expr, ExprData} from './Expr'
import {Functions} from './Functions'
import {IndexData} from './Index'
import {OrderBy} from './OrderBy'
import {Schema} from './Schema'
import {Selection} from './Selection'
import {Table, TableData, createTable} from './Table'
import {Target} from './Target'

const DATA = Symbol('Query.Data')

export enum QueryType {
  Insert = 'Insert',
  Select = 'Select',
  Update = 'Update',
  Delete = 'Delete',
  CreateTable = 'CreateTable',
  AlterTable = 'AlterTable',
  DropTable = 'DropTable',
  CreateIndex = 'CreateIndex',
  DropIndex = 'DropIndex',
  Batch = 'Batch',
  Transaction = 'Transaction',
  Raw = 'Raw'
}

export type QueryData =
  | QueryData.Insert
  | QueryData.Select
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
    validate?: boolean
  }
  export interface Insert extends QueryBase {
    type: QueryType.Insert
    into: TableData
    data?: Array<any>
    select?: QueryData.Select
  }
  export function Insert(insert: Omit<Insert, 'type'>): QueryData.Insert {
    return {type: QueryType.Insert, ...insert}
  }
  export interface Select extends QueryBase {
    type: QueryType.Select
    selection: ExprData
    from?: Target
  }
  export function Select(select: Omit<Select, 'type'>): QueryData.Select {
    return {type: QueryType.Select, ...select}
  }
  export interface Update extends QueryBase {
    type: QueryType.Update
    table: TableData
    set?: Record<string, any>
  }
  export function Update(update: Omit<Update, 'type'>): QueryData.Update {
    return {type: QueryType.Update, ...update}
  }
  export interface Delete extends QueryBase {
    type: QueryType.Delete
    table: TableData
  }
  export function Delete(del: Omit<Delete, 'type'>): QueryData.Delete {
    return {type: QueryType.Delete, ...del}
  }
  export interface CreateTable extends QueryBase {
    type: QueryType.CreateTable
    table: TableData
    ifNotExists?: boolean
  }
  export function CreateTable(
    create: Omit<CreateTable, 'type'>
  ): QueryData.CreateTable {
    return {type: QueryType.CreateTable, ...create}
  }
  export interface AlterTable extends QueryBase {
    type: QueryType.AlterTable
    table: TableData
    alterColumn?: ColumnData
    renameColumn?: {from: string; to: string}
    addColumn?: ColumnData
    dropColumn?: string
    renameTable?: {from: string}
  }
  export function AlterTable(
    alter: Omit<AlterTable, 'type'>
  ): QueryData.AlterTable {
    return {type: QueryType.AlterTable, ...alter}
  }
  export interface DropTable extends QueryBase {
    type: QueryType.DropTable
    table: TableData
    ifExists?: boolean
  }
  export function DropTable(
    drop: Omit<DropTable, 'type'>
  ): QueryData.DropTable {
    return {type: QueryType.DropTable, ...drop}
  }
  export interface CreateIndex extends QueryBase {
    type: QueryType.CreateIndex
    table: TableData
    index: IndexData
    ifNotExists?: boolean
  }
  export function CreateIndex(
    create: Omit<CreateIndex, 'type'>
  ): QueryData.CreateIndex {
    return {type: QueryType.CreateIndex, ...create}
  }
  export interface DropIndex extends QueryBase {
    type: QueryType.DropIndex
    table: TableData
    name: string
    ifExists?: boolean
  }
  export function DropIndex(
    drop: Omit<DropIndex, 'type'>
  ): QueryData.DropIndex {
    return {type: QueryType.DropIndex, ...drop}
  }
  export interface Batch extends QueryBase {
    type: QueryType.Batch
    queries: Array<QueryData>
  }
  export function Batch(batch: Omit<Batch, 'type'>): QueryData.Batch {
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
  ): QueryData.Transaction {
    return {type: QueryType.Transaction, ...transaction}
  }
  export type RawReturn = 'row' | 'rows' | undefined
  export interface Raw extends QueryBase {
    type: QueryType.Raw
    expectedReturn?: 'row' | 'rows'
    strings: ReadonlyArray<string>
    params: Array<any>
  }
  export function Raw(raw: Omit<Raw, 'type'>): QueryData.Raw {
    if (raw.strings.some(chunk => chunk.includes('?')))
      throw new TypeError('SQL injection hazard')
    return {type: QueryType.Raw, ...raw}
  }
}

export class Query<T> {
  declare [Selection.CursorType]: () => T;
  [DATA]: QueryData

  constructor(query: QueryData) {
    this[DATA] = query
  }

  static all(strings: TemplateStringsArray, ...params: Array<any>): Query<any> {
    return new Query(QueryData.Raw({expectedReturn: 'rows', strings, params}))
  }

  next<T>(cursor: Query<T>): Query<T> {
    return new Query<T>(
      QueryData.Batch({
        queries: [this[DATA], cursor[DATA]]
      })
    )
  }

  on(driver: Driver.Sync): T
  on(driver: Driver.Async): Promise<T>
  on(driver: Driver): T | Promise<T> {
    return driver.executeQuery(this[DATA]) as any
  }

  toSql(driver: Driver, options: CompileOptions = {forceInline: true}) {
    return driver.formatter.compile(this[DATA], options).sql
  }

  toJSON(): QueryData {
    return this[DATA]
  }
}

function addWhere<T extends QueryData>(query: T, where: Array<EV<boolean>>): T {
  const conditions: Array<any> = where.slice()
  if (query.where) conditions.push(new Expr(query.where))
  return {
    ...query,
    where: Expr.and(...conditions)[Expr.Data]
  }
}

export namespace Query {
  export class Delete extends Query<{rowsAffected: number}> {
    declare [DATA]: QueryData.Delete

    where(...where: Array<EV<boolean>>): Delete {
      return new Delete(addWhere(this[DATA], where))
    }

    take(limit: number | undefined): Delete {
      return new Delete({...this[DATA], limit})
    }

    skip(offset: number | undefined): Delete {
      return new Delete({...this[DATA], offset})
    }
  }

  export class Update<Definition> extends Query<{rowsAffected: number}> {
    declare [DATA]: QueryData.Update

    set(set: Table.Update<Definition>): Update<Definition> {
      return new Update({...this[DATA], set})
    }

    where(...where: Array<EV<boolean>>): Update<Definition> {
      return new Update(addWhere(this[DATA], where))
    }

    take(limit: number | undefined): Update<Definition> {
      return new Update({...this[DATA], limit})
    }

    skip(offset: number | undefined): Update<Definition> {
      return new Update({...this[DATA], offset})
    }
  }

  export class InsertValuesReturning<T> extends Query<T> {}

  export class Inserted extends Query<{rowsAffected: number}> {
    declare [DATA]: QueryData.Insert

    constructor(query: QueryData.Insert) {
      super(query)
    }

    returning<X extends Selection>(
      selection: X
    ): InsertValuesReturning<Selection.Infer<X>> {
      return new InsertValuesReturning<Selection.Infer<X>>(
        QueryData.Insert({
          ...this[DATA],
          selection: ExprData.create(selection)
        })
      )
    }
  }

  export class Insert<Definition> {
    constructor(protected into: TableData) {}

    selection(query: Query.SelectMultiple<Table.Select<Definition>>): Inserted {
      return new Inserted(
        QueryData.Insert({into: this.into, select: query[DATA]})
      )
    }

    values(...data: Array<Table.Insert<Definition>>): Inserted {
      return new Inserted(QueryData.Insert({into: this.into, data}))
    }
  }

  export class CreateTable extends Query<void> {
    constructor(protected table: TableData) {
      super(Schema.create(table))
    }
  }

  export class Batch<T = void> extends Query<T> {
    declare [DATA]: QueryData.Batch

    constructor(protected queries: Array<QueryData>) {
      super(QueryData.Batch({queries}))
    }

    next<T>(cursor: Query<T>): Query<T> {
      return new Query<T>(
        QueryData.Batch({
          queries: [...this[DATA].queries, cursor[DATA]]
        })
      )
    }
  }

  function joinTarget(
    joinType: 'left' | 'inner',
    query: QueryData.Select,
    to: Table<any> | TableSelect<any>,
    on: Array<EV<boolean>>
  ) {
    const toQuery = Query.isQuery(to)
      ? (to[DATA] as QueryData.Select)
      : undefined
    const target = toQuery ? toQuery.from : Target.Table(to[Table.Data])
    if (!query.from || !target) throw new Error('No from clause')
    const conditions = [...on]
    if (toQuery) {
      const where = toQuery.where
      if (where) conditions.push(new Expr(where))
    }
    return Target.Join(
      query.from,
      target,
      joinType,
      Expr.and(...conditions)[Expr.Data]
    )
  }

  export class SelectMultiple<Row> extends Query<Array<Row>> {
    declare [DATA]: QueryData.Select

    constructor(query: QueryData.Select) {
      super(query)
    }

    leftJoin<C>(
      that: Table<C> | TableSelect<C>,
      ...on: Array<EV<boolean>>
    ): SelectMultiple<Row> {
      const query = this[DATA]
      return new SelectMultiple({
        ...query,
        from: joinTarget('left', query, that, on)
      })
    }

    innerJoin<C>(
      that: Table<C> | TableSelect<C>,
      ...on: Array<EV<boolean>>
    ): SelectMultiple<Row> {
      const query = this[DATA]
      return new SelectMultiple({
        ...query,
        from: joinTarget('inner', query, that, on)
      })
    }

    select<X extends Selection>(
      selection: X
    ): SelectMultiple<Selection.Infer<X>> {
      return new SelectMultiple({
        ...this[DATA],
        selection: ExprData.create(selection)
      })
    }

    count(): SelectSingle<number> {
      return new SelectSingle({
        ...this[DATA],
        selection: Functions.count()[Expr.Data],
        singleResult: true
      })
    }

    orderBy(...orderBy: Array<Expr<any> | OrderBy>): SelectMultiple<Row> {
      return new SelectMultiple({
        ...this[DATA],
        orderBy: orderBy.map(e => {
          return Expr.isExpr(e) ? e.asc() : e
        })
      })
    }

    groupBy(...groupBy: Array<Expr<any>>): SelectMultiple<Row> {
      return new SelectMultiple({
        ...this[DATA],
        groupBy: groupBy.map(ExprData.create)
      })
    }

    maybeFirst(): SelectSingle<Row | undefined> {
      return new SelectSingle({...this[DATA], singleResult: true})
    }

    first(): SelectSingle<Row> {
      return new SelectSingle({
        ...this[DATA],
        singleResult: true,
        validate: true
      })
    }

    where(...where: Array<EV<boolean>>): SelectMultiple<Row> {
      return new SelectMultiple(addWhere(this[DATA], where))
    }

    take(limit: number | undefined): SelectMultiple<Row> {
      return new SelectMultiple({...this[DATA], limit})
    }

    skip(offset: number | undefined): SelectMultiple<Row> {
      return new SelectMultiple({...this[DATA], offset})
    }

    [Expr.ToExpr](): Expr<Row> {
      return new Expr<Row>(ExprData.Query(this[DATA]))
    }
  }

  export class TableSelect<Definition> extends SelectMultiple<
    Table.Select<Definition>
  > {
    declare [DATA]: QueryData.Select

    constructor(
      protected table: TableData,
      conditions: Array<EV<boolean>> = []
    ) {
      const target = Target.Table(table)
      super(
        QueryData.Select({
          from: target,
          selection: ExprData.Row(target),
          where: Expr.and(...conditions)[Expr.Data]
        })
      )
    }

    as(alias: string): Table<Definition> {
      return createTable({...this.table, alias})
    }

    create() {
      return new Query.CreateTable(this.table)
    }

    insertSelect(query: SelectMultiple<Table.Insert<Definition>>) {
      return new Query.Inserted(
        QueryData.Insert({into: this.table, select: query[DATA]})
      )
    }

    insertOne(record: Table.Insert<Definition>) {
      return new Query<Table.Select<Definition>>(
        QueryData.Insert({
          into: this.table,
          data: [record],
          selection: ExprData.Row(Target.Table(this.table)),
          singleResult: true
        })
      )
    }

    insertAll(data: Array<Table.Insert<Definition>>) {
      return new Query.Insert<Definition>(this.table).values(...data)
    }

    set(data: Table.Update<Definition>) {
      return new Query.Update<Definition>(
        QueryData.Update({
          table: this.table,
          where: this[DATA].where
        })
      ).set(data)
    }

    delete() {
      return new Query.Delete(
        QueryData.Delete({
          table: this.table,
          where: this[DATA].where
        })
      )
    }

    get(name: string): Expr<any> {
      return new Expr(
        ExprData.Field(ExprData.Row(Target.Table(this.table)), name)
      )
    }
  }

  export class SelectSingle<Row> extends Query<Row> {
    declare [DATA]: QueryData.Select

    constructor(query: QueryData.Select) {
      super(query)
    }

    leftJoin<C>(
      that: Table<C> | TableSelect<C>,
      ...on: Array<EV<boolean>>
    ): SelectSingle<Row> {
      const query = this[DATA]
      return new SelectSingle({
        ...query,
        from: joinTarget('left', query, that, on)
      })
    }

    innerJoin<C>(
      that: Table<C> | TableSelect<C>,
      ...on: Array<EV<boolean>>
    ): SelectSingle<Row> {
      const query = this[DATA]
      return new SelectSingle({
        ...query,
        from: joinTarget('inner', query, that, on)
      })
    }

    select<X extends Selection>(
      selection: X
    ): SelectSingle<Selection.Infer<X>> {
      return new SelectSingle({
        ...this[DATA],
        selection: ExprData.create(selection)
      })
    }

    orderBy(...orderBy: Array<OrderBy>): SelectSingle<Row> {
      return new SelectSingle({
        ...this[DATA],
        orderBy
      })
    }

    groupBy(...groupBy: Array<Expr<any>>): SelectSingle<Row> {
      return new SelectSingle({
        ...this[DATA],
        groupBy: groupBy.map(ExprData.create)
      })
    }

    where(...where: Array<EV<boolean>>): SelectSingle<Row> {
      return new SelectSingle(addWhere(this[DATA], where))
    }

    take(limit: number | undefined): SelectSingle<Row> {
      return new SelectSingle({...this[DATA], limit})
    }

    skip(offset: number | undefined): SelectSingle<Row> {
      return new SelectSingle({...this[DATA], offset})
    }

    all(): SelectMultiple<Row> {
      return new SelectMultiple({...this[DATA], singleResult: false})
    }

    [Expr.ToExpr](): Expr<Row> {
      return new Expr<Row>(ExprData.Query(this[DATA]))
    }
  }
}

export namespace Query {
  export const Data: typeof DATA = DATA

  export function isQuery<T>(input: any): input is Query<T> {
    return input !== null && Boolean(DATA in input)
  }

  export function isSingle<T>(input: any): input is Query.SelectSingle<T> {
    return input instanceof Query.SelectSingle
  }

  export function isMultiple<T>(input: any): input is Query.SelectMultiple<T> {
    return input instanceof Query.SelectSingle
  }
}
