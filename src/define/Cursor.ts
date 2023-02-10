import {Driver} from '../lib/Driver'
import {CompileOptions} from '../lib/Formatter'
import {EV, Expr, ExprData} from './Expr'
import {Functions} from './Functions'
import {OrderBy} from './OrderBy'
import {Query} from './Query'
import {Schema} from './Schema'
import {Selection} from './Selection'
import {Table, TableData, createTable} from './Table'
import {Target} from './Target'

const QUERY = Symbol('Cursor.Query')

export class Cursor<T> {
  declare [Selection.CursorType]: () => T;
  [QUERY]: Query<T>
  static Query: typeof QUERY = QUERY

  constructor(query: Query<T>) {
    this[QUERY] = query
  }

  static all(
    strings: TemplateStringsArray,
    ...params: Array<any>
  ): Cursor<any> {
    return new Cursor(Query.Raw({expectedReturn: 'rows', strings, params}))
  }

  next<T>(cursor: Cursor<T>): Cursor<T> {
    return new Cursor<T>(
      Query.Batch({
        queries: [this[QUERY], cursor[QUERY]]
      })
    )
  }

  on(driver: Driver.Sync): T
  on(driver: Driver.Async): Promise<T>
  on(driver: Driver): T | Promise<T> {
    return driver.executeQuery(this[QUERY])
  }

  toSql(driver: Driver, options: CompileOptions = {forceInline: true}) {
    return driver.formatter.compile(this[QUERY], options).sql
  }

  toJSON(): Query<T> {
    return this[QUERY]
  }
}

function addWhere<T extends Query>(query: T, where: Array<EV<boolean>>): T {
  const conditions: Array<any> = where.slice()
  if (query.where) conditions.push(new Expr(query.where))
  return {
    ...query,
    where: Expr.and(...conditions)[Expr.Data]
  }
}

export namespace Cursor {
  export class Delete extends Cursor<{rowsAffected: number}> {
    query(): Query.Delete {
      return super[QUERY] as Query.Delete
    }

    where(...where: Array<EV<boolean>>): Delete {
      return new Delete(addWhere(this[QUERY], where))
    }

    take(limit: number | undefined): Delete {
      return new Delete({...this[QUERY], limit})
    }

    skip(offset: number | undefined): Delete {
      return new Delete({...this[QUERY], offset})
    }
  }

  export class Update<Definition> extends Cursor<{rowsAffected: number}> {
    declare [QUERY]: Query.Update

    set(set: Table.Update<Definition>): Update<Definition> {
      return new Update({...this[QUERY], set})
    }

    where(...where: Array<EV<boolean>>): Update<Definition> {
      return new Update(addWhere(this[QUERY], where))
    }

    take(limit: number | undefined): Update<Definition> {
      return new Update({...this[QUERY], limit})
    }

    skip(offset: number | undefined): Update<Definition> {
      return new Update({...this[QUERY], offset})
    }
  }

  export class InsertValuesReturning<T> extends Cursor<T> {}

  export class Inserted extends Cursor<{rowsAffected: number}> {
    declare [QUERY]: Query.Insert

    constructor(query: Query.Insert) {
      super(query)
    }

    returning<X extends Selection>(
      selection: X
    ): InsertValuesReturning<Selection.Infer<X>> {
      return new InsertValuesReturning<Selection.Infer<X>>(
        Query.Insert({...this[QUERY], selection: ExprData.create(selection)})
      )
    }
  }

  export class Insert<Definition> {
    constructor(protected into: TableData) {}

    selection(
      query: Cursor.SelectMultiple<Table.Select<Definition>>
    ): Inserted {
      return new Inserted(Query.Insert({into: this.into, select: query[QUERY]}))
    }

    values(...data: Array<Table.Insert<Definition>>): Inserted {
      return new Inserted(Query.Insert({into: this.into, data}))
    }
  }

  export class CreateTable extends Cursor<void> {
    constructor(protected table: TableData) {
      super(Schema.create(table))
    }
  }

  export class Batch<T = void> extends Cursor<T> {
    declare [QUERY]: Query.Batch

    constructor(protected queries: Array<Query>) {
      super(Query.Batch({queries}))
    }

    next<T>(cursor: Cursor<T>): Cursor<T> {
      return new Cursor<T>(
        Query.Batch({
          queries: [...this[QUERY].queries, cursor[QUERY]]
        })
      )
    }
  }

  function joinTarget(
    joinType: 'left' | 'inner',
    query: Query.Select,
    to: Table<any> | TableSelect<any>,
    on: Array<EV<boolean>>
  ) {
    const toQuery =
      to instanceof Cursor ? (to[QUERY] as Query.Select) : undefined
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

  export class SelectMultiple<Row> extends Cursor<Array<Row>> {
    declare [QUERY]: Query.Select

    constructor(query: Query.Select) {
      super(query)
    }

    leftJoin<C>(
      that: Table<C> | TableSelect<C>,
      ...on: Array<EV<boolean>>
    ): SelectMultiple<Row> {
      const query = this[QUERY]
      return new SelectMultiple({
        ...query,
        from: joinTarget('left', query, that, on)
      })
    }

    innerJoin<C>(
      that: Table<C> | TableSelect<C>,
      ...on: Array<EV<boolean>>
    ): SelectMultiple<Row> {
      const query = this[QUERY]
      return new SelectMultiple({
        ...query,
        from: joinTarget('inner', query, that, on)
      })
    }

    select<X extends Selection>(
      selection: X
    ): SelectMultiple<Selection.Infer<X>> {
      return new SelectMultiple({
        ...this[QUERY],
        selection: ExprData.create(selection)
      })
    }

    count(): SelectSingle<number> {
      return new SelectSingle({
        ...this[QUERY],
        selection: Functions.count()[Expr.Data],
        singleResult: true
      })
    }

    orderBy(...orderBy: Array<Expr<any> | OrderBy>): SelectMultiple<Row> {
      return new SelectMultiple({
        ...this[QUERY],
        orderBy: orderBy.map(e => {
          return Expr.isExpr(e) ? e.asc() : e
        })
      })
    }

    groupBy(...groupBy: Array<Expr<any>>): SelectMultiple<Row> {
      return new SelectMultiple({
        ...this[QUERY],
        groupBy: groupBy.map(ExprData.create)
      })
    }

    first(): SelectSingle<Row | undefined> {
      return new SelectSingle({...this[QUERY], singleResult: true})
    }

    sure(): SelectSingle<Row> {
      return new SelectSingle({
        ...this[QUERY],
        singleResult: true,
        validate: true
      })
    }

    where(...where: Array<EV<boolean>>): SelectMultiple<Row> {
      return new SelectMultiple(addWhere(this[QUERY], where))
    }

    take(limit: number | undefined): SelectMultiple<Row> {
      return new SelectMultiple({...this[QUERY], limit})
    }

    skip(offset: number | undefined): SelectMultiple<Row> {
      return new SelectMultiple({...this[QUERY], offset})
    }

    [Expr.ToExpr](): Expr<Row> {
      return new Expr<Row>(ExprData.Query(this[QUERY]))
    }
  }

  export class TableSelect<Definition> extends SelectMultiple<
    Table.Select<Definition>
  > {
    declare [QUERY]: Query.Select

    constructor(
      protected table: TableData,
      conditions: Array<EV<boolean>> = []
    ) {
      const target = Target.Table(table)
      super(
        Query.Select({
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
      return new Cursor.CreateTable(this.table)
    }

    insertSelect(query: SelectMultiple<Table.Insert<Definition>>) {
      return new Cursor.Inserted(
        Query.Insert({into: this.table, select: query[QUERY]})
      )
    }

    insertOne(record: Table.Insert<Definition>) {
      return new Cursor<Table.Select<Definition>>(
        Query.Insert({
          into: this.table,
          data: [record],
          selection: ExprData.Row(Target.Table(this.table)),
          singleResult: true
        })
      )
    }

    insertAll(data: Array<Table.Insert<Definition>>) {
      return new Cursor.Insert<Definition>(this.table).values(...data)
    }

    set(data: Table.Update<Definition>) {
      return new Cursor.Update<Definition>(
        Query.Update({
          table: this.table,
          where: this[QUERY].where
        })
      ).set(data)
    }

    delete() {
      return new Cursor.Delete(
        Query.Delete({
          table: this.table,
          where: this[QUERY].where
        })
      )
    }

    get(name: string): Expr<any> {
      return new Expr(
        ExprData.Field(ExprData.Row(Target.Table(this.table)), name)
      )
    }
  }

  export class SelectSingle<Row> extends Cursor<Row> {
    declare [QUERY]: Query.Select

    constructor(query: Query.Select) {
      super(query)
    }

    leftJoin<C>(
      that: Table<C> | TableSelect<C>,
      ...on: Array<EV<boolean>>
    ): SelectSingle<Row> {
      const query = this[QUERY]
      return new SelectSingle({
        ...query,
        from: joinTarget('left', query, that, on)
      })
    }

    innerJoin<C>(
      that: Table<C> | TableSelect<C>,
      ...on: Array<EV<boolean>>
    ): SelectSingle<Row> {
      const query = this[QUERY]
      return new SelectSingle({
        ...query,
        from: joinTarget('inner', query, that, on)
      })
    }

    select<X extends Selection>(
      selection: X
    ): SelectSingle<Selection.Infer<X>> {
      return new SelectSingle({
        ...this[QUERY],
        selection: ExprData.create(selection)
      })
    }

    orderBy(...orderBy: Array<OrderBy>): SelectSingle<Row> {
      return new SelectSingle({
        ...this[QUERY],
        orderBy
      })
    }

    groupBy(...groupBy: Array<Expr<any>>): SelectSingle<Row> {
      return new SelectSingle({
        ...this[QUERY],
        groupBy: groupBy.map(ExprData.create)
      })
    }

    where(...where: Array<EV<boolean>>): SelectSingle<Row> {
      return new SelectSingle(addWhere(this[QUERY], where))
    }

    take(limit: number | undefined): SelectSingle<Row> {
      return new SelectSingle({...this[QUERY], limit})
    }

    skip(offset: number | undefined): SelectSingle<Row> {
      return new SelectSingle({...this[QUERY], offset})
    }

    all(): SelectMultiple<Row> {
      return new SelectMultiple({...this[QUERY], singleResult: false})
    }

    [Expr.ToExpr](): Expr<Row> {
      return new Expr<Row>(ExprData.Query(this[QUERY]))
    }
  }
}
