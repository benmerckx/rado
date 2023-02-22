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

const {assign} = Object

const DATA = Symbol('Query.Data')

export enum QueryType {
  Insert = 'QueryData.Insert',
  Select = 'QueryData.Select',
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
    constructor(data: Omit<T, 'type'>) {
      assign(this, data)
    }
  }
  export class Select extends Data<Select> {
    type = QueryType.Select as const
    declare selection: ExprData
    declare from?: Target
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
    constructor(data: Omit<Raw, 'type'>) {
      if (data.strings.some(chunk => chunk.includes('?')))
        throw new TypeError('SQL injection hazard')
      super(data)
    }
  }
}

export class Query<T> {
  declare [Selection.CursorType]: () => T;
  [DATA]: QueryData

  constructor(query: QueryData) {
    this[DATA] = query
  }

  static all(strings: TemplateStringsArray, ...params: Array<any>): Query<any> {
    return new Query(
      new QueryData.Raw({expectedReturn: 'rows', strings, params})
    )
  }

  next<T>(cursor: Query<T>): Query<T> {
    return new Query<T>(
      new QueryData.Batch({
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

  toJSON() {
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
        new QueryData.Insert({
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
        new QueryData.Insert({into: this.into, select: query[DATA]})
      )
    }

    values(...data: Array<Table.Insert<Definition>>): Inserted {
      return new Inserted(new QueryData.Insert({into: this.into, data}))
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
      super(new QueryData.Batch({queries}))
    }

    next<T>(cursor: Query<T>): Query<T> {
      return new Query<T>(
        new QueryData.Batch({
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
    const target = toQuery ? toQuery.from : new Target.Table(to[Table.Data])
    if (!query.from || !target) throw new Error('No from clause')
    const conditions = [...on]
    if (toQuery) {
      const where = toQuery.where
      if (where) conditions.push(new Expr(where))
    }
    return new Target.Join(
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
      return new Expr<Row>(new ExprData.Query(this[DATA]))
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
      const target = new Target.Table(table)
      super(
        new QueryData.Select({
          from: target,
          selection: new ExprData.Row(target),
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
        new QueryData.Insert({into: this.table, select: query[DATA]})
      )
    }

    insertOne(record: Table.Insert<Definition>) {
      return new Query<Table.Select<Definition>>(
        new QueryData.Insert({
          into: this.table,
          data: [record],
          selection: new ExprData.Row(new Target.Table(this.table)),
          singleResult: true
        })
      )
    }

    insertAll(data: Array<Table.Insert<Definition>>) {
      return new Query.Insert<Definition>(this.table).values(...data)
    }

    set(data: Table.Update<Definition>) {
      return new Query.Update<Definition>(
        new QueryData.Update({
          table: this.table,
          where: this[DATA].where
        })
      ).set(data)
    }

    delete() {
      return new Query.Delete(
        new QueryData.Delete({
          table: this.table,
          where: this[DATA].where
        })
      )
    }

    get(name: string): Expr<any> {
      return new Expr(
        new ExprData.Field(new ExprData.Row(new Target.Table(this.table)), name)
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
      return new Expr<Row>(new ExprData.Query(this[DATA]))
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
