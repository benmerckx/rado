import {Driver} from '../lib/Driver.js'
import {CompileOptions} from '../lib/Formatter.js'
import {randomAlias} from '../util/Alias.js'
import {ColumnData} from './Column.js'
import {EV, Expr, ExprData, ExprType} from './Expr.js'
import {Functions} from './Functions.js'
import {IndexData} from './Index.js'
import {OrderBy} from './OrderBy.js'
import {Schema} from './Schema.js'
import {Selection} from './Selection.js'
import {Table, TableData, createTable} from './Table.js'
import {Target, TargetType} from './Target.js'
import {
  VirtualTable,
  VirtualTableData,
  createVirtualTable
} from './VirtualTable.js'

const {keys, assign, fromEntries} = Object

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

export class Batch<T = void> extends Query<T> {
  declare [Query.Data]: QueryData.Batch

  constructor(protected queries: Array<QueryData>) {
    super(new QueryData.Batch({queries}))
  }

  next<T>(cursor: Query<T>): Query<T> {
    return new Query<T>(
      new QueryData.Batch({
        queries: [...this[Query.Data].queries, cursor[Query.Data]]
      })
    )
  }
}

export class CreateTable extends Query<void> {
  constructor(protected table: TableData) {
    super(Schema.create(table))
  }
}

export class Delete extends Query<{rowsAffected: number}> {
  declare [Query.Data]: QueryData.Delete

  constructor(query: QueryData.Delete) {
    super(query)
  }

  where(...where: Array<EV<boolean>>): Delete {
    return new Delete(this.addWhere(where))
  }

  orderBy(...orderBy: Array<OrderBy>): Delete {
    return new Delete(this[Query.Data].with({orderBy}))
  }

  take(limit: number | undefined): Delete {
    return new Delete(this[Query.Data].with({limit}))
  }

  skip(offset: number | undefined): Delete {
    return new Delete(this[Query.Data].with({offset}))
  }
}

export class Insert<T = {rowsAffected: number}> extends Query<T> {
  declare [Query.Data]: QueryData.Insert

  constructor(query: QueryData.Insert) {
    super(query)
  }

  returning<X extends Selection>(
    selection: X
  ): Insert<Array<Selection.Infer<X>>> {
    return new Insert<Array<Selection.Infer<X>>>(
      new QueryData.Insert({
        ...this[Query.Data],
        selection: ExprData.create(selection)
      })
    )
  }
}

export class InsertOne<T> extends Query<T> {
  declare [Query.Data]: QueryData.Insert

  constructor(query: QueryData.Insert) {
    super(query)
  }

  returning<X extends Selection>(selection: X): Insert<Selection.Infer<X>> {
    return new Insert<Selection.Infer<X>>(
      new QueryData.Insert({
        ...this[Query.Data],
        selection: ExprData.create(selection),
        singleResult: true
      })
    )
  }
}

export class InsertInto<Definition> {
  constructor(protected into: TableData) {}

  selection(query: Select<Table.Select<Definition>>): Insert {
    return new Insert(
      new QueryData.Insert({into: this.into, select: query[Query.Data]})
    )
  }

  values(...data: Array<Table.Insert<Definition>>): Insert {
    return new Insert(new QueryData.Insert({into: this.into, data}))
  }
}

function joinTarget(
  joinType: 'left' | 'inner',
  query: QueryData.Select,
  to: Table<any> | Select<any>,
  on: Array<EV<boolean>>
) {
  const toQuery = Query.isQuery(to)
    ? (to[Query.Data] as QueryData.Select)
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

function columnsOf(expr: ExprData) {
  switch (expr.type) {
    case ExprType.Record:
      return keys(expr.fields)
    case ExprType.Row:
      switch (expr.target.type) {
        case TargetType.Table:
          return keys(expr.target.table.columns)
        default:
          throw new Error('Could not retrieve CTE columns')
      }
    default:
      throw new Error('Could not retrieve CTE columns')
  }
}

function makeRecursiveUnion<T>(
  initial: QueryData.Select,
  createUnion: () => Select<T> | Union<T>,
  operator: QueryData.UnionOperation
): VirtualTable.Of<T> {
  const name = randomAlias()
  const cols = columnsOf(initial.selection)
  const union = new QueryData.Union({
    a: initial,
    operator,
    b: () => createUnion()[Query.Data]
  })
  const target = new Target.CTE(name, union)
  const row = new ExprData.Row(target)
  const selection = new ExprData.Record(
    fromEntries(cols.map(col => [col, new ExprData.Field(row, col)]))
  )
  const select = (conditions: Array<EV<boolean>>) => {
    const where = Expr.and(...conditions)[Expr.Data]
    return new Select(
      new QueryData.Select({
        selection,
        from: target,
        where
      })
    )
  }
  const cte = createVirtualTable<Record<string, any>>({
    name,
    target,
    select
  })
  return cte as VirtualTable.Of<T>
}

export class RecursiveUnion<Row> {
  constructor(public initialSelect: QueryData.Select) {}

  union(create: () => Select<Row> | Union<Row>): VirtualTable.Of<Row> {
    return makeRecursiveUnion(
      this.initialSelect,
      create,
      QueryData.UnionOperation.Union
    )
  }

  unionAll(create: () => Select<Row> | Union<Row>): VirtualTable.Of<Row> {
    return makeRecursiveUnion(
      this.initialSelect,
      create,
      QueryData.UnionOperation.UnionAll
    )
  }
}

export class Union<Row> extends Query<Array<Row>> {
  declare [Query.Data]: QueryData.Union | QueryData.Select

  constructor(query: QueryData.Union | QueryData.Select) {
    super(query)
  }

  union(query: Select<Row> | Union<Row>): Union<Row> {
    return new Union(
      new QueryData.Union({
        a: this[Query.Data],
        operator: QueryData.UnionOperation.Union,
        b: query[Query.Data]
      })
    )
  }

  unionAll(query: Select<Row> | Union<Row>): Union<Row> {
    return new Union(
      new QueryData.Union({
        a: this[Query.Data],
        operator: QueryData.UnionOperation.UnionAll,
        b: query[Query.Data]
      })
    )
  }

  except(query: Select<Row> | Union<Row>): Union<Row> {
    return new Union(
      new QueryData.Union({
        a: this[Query.Data],
        operator: QueryData.UnionOperation.Except,
        b: query[Query.Data]
      })
    )
  }

  intersect(query: Select<Row> | Union<Row>): Union<Row> {
    return new Union(
      new QueryData.Union({
        a: this[Query.Data],
        operator: QueryData.UnionOperation.Intersect,
        b: query[Query.Data]
      })
    )
  }
}

export class Select<Row> extends Union<Row> {
  declare [Query.Data]: QueryData.Select

  constructor(query: QueryData.Select) {
    super(query)
  }

  from(table: Table<any> | VirtualTable<any>): Select<Row> {
    const virtual: VirtualTableData = table[VirtualTable.Data]
    return new Select(
      this[Query.Data].with({from: virtual?.target || new Target.Table(table)})
    )
  }

  indexedBy(index: IndexData) {
    const from = this[Query.Data].from
    switch (from?.type) {
      case TargetType.Table:
        return new Select(
          this[Query.Data].with({
            from: new Target.Table(from.table, index)
          })
        )
      default:
        throw new Error('Cannot index by without table target')
    }
  }

  leftJoin<C>(
    that: Table<C> | Select<C>,
    ...on: Array<EV<boolean>>
  ): Select<Row> {
    const query = this[Query.Data]
    return new Select(
      this[Query.Data].with({
        from: joinTarget('left', query, that, on)
      })
    )
  }

  innerJoin<C>(
    that: Table<C> | Select<C>,
    ...on: Array<EV<boolean>>
  ): Select<Row> {
    const query = this[Query.Data]
    return new Select(
      this[Query.Data].with({
        from: joinTarget('inner', query, that, on)
      })
    )
  }

  select<X extends Selection>(selection: X): Select<Selection.Infer<X>> {
    return new Select(
      this[Query.Data].with({
        selection: ExprData.create(selection)
      })
    )
  }

  count(): SelectFirst<number> {
    return new SelectFirst(
      this[Query.Data].with({
        selection: Functions.count()[Expr.Data],
        singleResult: true
      })
    )
  }

  orderBy(...orderBy: Array<Expr<any> | OrderBy>): Select<Row> {
    return new Select(
      this[Query.Data].with({
        orderBy: orderBy.map((e): OrderBy => {
          return Expr.isExpr<any>(e) ? e.asc() : e
        })
      })
    )
  }

  groupBy(...groupBy: Array<Expr<any>>): Select<Row> {
    return new Select(
      this[Query.Data].with({
        groupBy: groupBy.map(ExprData.create)
      })
    )
  }

  maybeFirst(): SelectFirst<Row | null> {
    return new SelectFirst(this[Query.Data].with({singleResult: true}))
  }

  first(): SelectFirst<Row> {
    return new SelectFirst(
      this[Query.Data].with({
        singleResult: true,
        validate: true
      })
    )
  }

  where(...where: Array<EV<boolean>>): Select<Row> {
    return new Select(this.addWhere(where))
  }

  take(limit: number | undefined): Select<Row> {
    return new Select(this[Query.Data].with({limit}))
  }

  skip(offset: number | undefined): Select<Row> {
    return new Select(this[Query.Data].with({offset}))
  }

  [Expr.ToExpr](): Expr<Row> {
    return new Expr<Row>(new ExprData.Query(this[Query.Data]))
  }
}

export class SelectFirst<Row> extends Query<Row> {
  declare [Query.Data]: QueryData.Select

  constructor(query: QueryData.Select) {
    super(query)
  }

  from(table: Table<any>): Select<Row> {
    return new Select(this[Query.Data].with({from: new Target.Table(table)}))
  }

  leftJoin<C>(
    that: Table<C> | Select<C>,
    ...on: Array<EV<boolean>>
  ): SelectFirst<Row> {
    const query = this[Query.Data]
    return new SelectFirst(
      this[Query.Data].with({
        from: joinTarget('left', query, that, on)
      })
    )
  }

  innerJoin<C>(
    that: Table<C> | Select<C>,
    ...on: Array<EV<boolean>>
  ): SelectFirst<Row> {
    const query = this[Query.Data]
    return new SelectFirst(
      this[Query.Data].with({
        from: joinTarget('inner', query, that, on)
      })
    )
  }

  select<X extends Selection>(selection: X): SelectFirst<Selection.Infer<X>> {
    return new SelectFirst(
      this[Query.Data].with({
        selection: ExprData.create(selection)
      })
    )
  }

  orderBy(...orderBy: Array<OrderBy>): SelectFirst<Row> {
    return new SelectFirst(
      this[Query.Data].with({
        orderBy
      })
    )
  }

  groupBy(...groupBy: Array<Expr<any>>): SelectFirst<Row> {
    return new SelectFirst(
      this[Query.Data].with({
        groupBy: groupBy.map(ExprData.create)
      })
    )
  }

  where(...where: Array<EV<boolean>>): SelectFirst<Row> {
    return new SelectFirst(this.addWhere(where))
  }

  take(limit: number | undefined): SelectFirst<Row> {
    return new SelectFirst(this[Query.Data].with({limit}))
  }

  skip(offset: number | undefined): SelectFirst<Row> {
    return new SelectFirst(this[Query.Data].with({offset}))
  }

  all(): Select<Row> {
    return new Select(this[Query.Data].with({singleResult: false}))
  }

  [Expr.ToExpr](): Expr<Row> {
    return new Expr<Row>(new ExprData.Query(this[Query.Data]))
  }
}

export class TableSelect<Definition> extends Select<Table.Select<Definition>> {
  declare [Query.Data]: QueryData.Select

  constructor(protected table: TableData, conditions: Array<EV<boolean>> = []) {
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
    return new CreateTable(this.table)
  }

  insert(query: Select<Table.Insert<Definition>>): Insert
  insert(rows: Array<Table.Insert<Definition>>): Insert
  insert(row: Table.Insert<Definition>): InsertOne<Table.Select<Definition>>
  insert(input: any) {
    if (input instanceof Select) {
      return this.insertSelect(input)
    } else if (Array.isArray(input)) {
      return this.insertAll(input)
    } else {
      return this.insertOne(input)
    }
  }

  insertSelect(query: Select<Table.Insert<Definition>>) {
    return new Insert(
      new QueryData.Insert({into: this.table, select: query[Query.Data]})
    )
  }

  insertOne(record: Table.Insert<Definition>) {
    return new InsertOne<Table.Select<Definition>>(
      new QueryData.Insert({
        into: this.table,
        data: [record],
        selection: new ExprData.Row(new Target.Table(this.table)),
        singleResult: true
      })
    )
  }

  insertAll(data: Array<Table.Insert<Definition>>) {
    return new InsertInto<Definition>(this.table).values(...data)
  }

  set(data: Table.Update<Definition>) {
    return new Update<Definition>(
      new QueryData.Update({
        table: this.table,
        where: this[Query.Data].where
      })
    ).set(data)
  }

  delete() {
    return new Delete(
      new QueryData.Delete({
        table: this.table,
        where: this[Query.Data].where
      })
    )
  }

  get(name: string): Expr<any> {
    return new Expr(
      new ExprData.Field(new ExprData.Row(new Target.Table(this.table)), name)
    )
  }
}

export class Update<Definition> extends Query<{rowsAffected: number}> {
  declare [Query.Data]: QueryData.Update

  set(set: Table.Update<Definition>): Update<Definition> {
    return new Update(this[Query.Data].with({set}))
  }

  where(...where: Array<EV<boolean>>): Update<Definition> {
    return new Update(this.addWhere(where))
  }

  take(limit: number | undefined): Update<Definition> {
    return new Update(this[Query.Data].with({limit}))
  }

  skip(offset: number | undefined): Update<Definition> {
    return new Update(this[Query.Data].with({offset}))
  }
}
