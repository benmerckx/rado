import {Driver} from '../lib/Driver'
import {CompileOptions} from '../lib/Formatter'
import {EV, Expr, ExprData} from './Expr'
import {Functions} from './Functions'
import {OrderBy} from './OrderBy'
import {Query} from './Query'
import {Schema} from './Schema'
import {Selection} from './Selection'
import {Table, TableData, createTable, table} from './Table'
import {Target} from './Target'

export class Cursor<T> {
  [Selection.__cursorType](): T {
    throw 'assert'
  }

  constructor(query: Query<T>) {
    Object.defineProperty(this, 'query', {
      enumerable: false,
      value: () => query
    })
  }

  static all(
    strings: TemplateStringsArray,
    ...params: Array<any>
  ): Cursor<any> {
    return new Cursor(Query.Raw({expectedReturn: 'rows', strings, params}))
  }

  query(): Query<T> {
    throw new Error('Not implemented')
  }

  next<T>(cursor: Cursor<T>): Cursor<T> {
    return new Cursor<T>(
      Query.Batch({
        queries: [this.query(), cursor.query()]
      })
    )
  }

  on(driver: Driver.Sync): T
  on(driver: Driver.Async): Promise<T>
  on(driver: Driver): T | Promise<T> {
    return driver.executeQuery(this.query())
  }

  toSql(driver: Driver, options: CompileOptions = {forceInline: true}) {
    return driver.formatter.compile(this.query(), options).sql
  }

  toJSON(): Query<T> {
    return this.query()
  }
}

function addWhere<T>(query: Query<T>, where: Array<EV<boolean>>): Query<T> {
  const conditions: Array<any> = where.slice()
  if (query.where) conditions.push(new Expr(query.where))
  return {
    ...query,
    where: Expr.and(...conditions).expr
  }
}

export namespace Cursor {
  export class Delete extends Cursor<{rowsAffected: number}> {
    query(): Query.Delete {
      return super.query() as Query.Delete
    }

    where(...where: Array<EV<boolean>>): Delete {
      return new Delete(addWhere(this.query(), where))
    }

    take(limit: number | undefined): Delete {
      return new Delete({...this.query(), limit})
    }

    skip(offset: number | undefined): Delete {
      return new Delete({...this.query(), offset})
    }
  }

  export class Update<Definition> extends Cursor<{rowsAffected: number}> {
    query(): Query.Update {
      return super.query() as Query.Update
    }

    set(set: Table.Update<Definition>): Update<Definition> {
      return new Update({...this.query(), set})
    }

    where(...where: Array<EV<boolean>>): Update<Definition> {
      return new Update(addWhere(this.query(), where))
    }

    take(limit: number | undefined): Update<Definition> {
      return new Update({...this.query(), limit})
    }

    skip(offset: number | undefined): Update<Definition> {
      return new Update({...this.query(), offset})
    }
  }

  export class InsertValuesReturning<T> extends Cursor<T> {}

  export class Inserted extends Cursor<{rowsAffected: number}> {
    query(): Query.Insert {
      return super.query() as Query.Insert
    }

    returning<X extends Selection>(
      selection: X
    ): InsertValuesReturning<Selection.Infer<X>> {
      return new InsertValuesReturning<Selection.Infer<X>>(
        Query.Insert({...this.query(), selection: ExprData.create(selection)})
      )
    }
  }

  export class Insert<Definition> {
    constructor(protected into: TableData) {}

    selection(
      query: Cursor.SelectMultiple<Table.Select<Definition>>
    ): Inserted {
      return new Inserted(
        Query.Insert({into: this.into, select: query.query()})
      )
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
    query(): Query.Batch {
      return super.query() as Query.Batch
    }

    constructor(protected queries: Array<Query>) {
      super(Query.Batch({queries}))
    }

    next<T>(cursor: Cursor<T>): Cursor<T> {
      return new Cursor<T>(
        Query.Batch({
          queries: [...this.query().queries, cursor.query()]
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
      to instanceof Cursor ? (to.query() as Query.Select) : undefined
    const target = toQuery ? toQuery.from : Target.Table(to[table.data])
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
      Expr.and(...conditions).expr
    )
  }

  export class SelectMultiple<Row> extends Cursor<Array<Row>> {
    query(): Query.Select {
      return super.query() as Query.Select
    }

    leftJoin<C>(
      that: Table<C> | TableSelect<C>,
      ...on: Array<EV<boolean>>
    ): SelectMultiple<Row> {
      const query = this.query()
      return new SelectMultiple({
        ...query,
        from: joinTarget('left', query, that, on)
      })
    }

    innerJoin<C>(
      that: Table<C> | TableSelect<C>,
      ...on: Array<EV<boolean>>
    ): SelectMultiple<Row> {
      const query = this.query()
      return new SelectMultiple({
        ...query,
        from: joinTarget('inner', query, that, on)
      })
    }

    select<X extends Selection>(
      selection: X
    ): SelectMultiple<Selection.Infer<X>> {
      return new SelectMultiple({
        ...this.query(),
        selection: ExprData.create(selection)
      })
    }

    count(): SelectSingle<number> {
      return new SelectSingle({
        ...this.query(),
        selection: Functions.count().expr,
        singleResult: true
      })
    }

    orderBy(...orderBy: Array<Expr<any> | OrderBy>): SelectMultiple<Row> {
      return new SelectMultiple({
        ...this.query(),
        orderBy: orderBy.map(e => {
          return e instanceof Expr ? e.asc() : e
        })
      })
    }

    groupBy(...groupBy: Array<Expr<any>>): SelectMultiple<Row> {
      return new SelectMultiple({
        ...this.query(),
        groupBy: groupBy.map(ExprData.create)
      })
    }

    first(): SelectSingle<Row | undefined> {
      return new SelectSingle({...this.query(), singleResult: true})
    }

    sure(): SelectSingle<Row> {
      return new SelectSingle({
        ...this.query(),
        singleResult: true,
        validate: true
      })
    }

    where(...where: Array<EV<boolean>>): SelectMultiple<Row> {
      return new SelectMultiple(addWhere(this.query(), where))
    }

    take(limit: number | undefined): SelectMultiple<Row> {
      return new SelectMultiple({...this.query(), limit})
    }

    skip(offset: number | undefined): SelectMultiple<Row> {
      return new SelectMultiple({...this.query(), offset})
    }

    [Expr.toExpr](): Expr<Row> {
      return new Expr<Row>(ExprData.Query(this.query()))
    }
  }

  export class TableSelect<Definition> extends SelectMultiple<
    Table.Select<Definition>
  > {
    constructor(
      protected table: TableData,
      conditions: Array<EV<boolean>> = []
    ) {
      const target = Target.Table(table)
      super(
        Query.Select({
          from: target,
          selection: ExprData.Row(target),
          where: Expr.and(...conditions).expr
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
        Query.Insert({into: this.table, select: query.query()})
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
          where: this.query().where
        })
      ).set(data)
    }

    delete() {
      return new Cursor.Delete(
        Query.Delete({
          table: this.table,
          where: this.query().where
        })
      )
    }
  }

  export class SelectSingle<Row> extends Cursor<Row> {
    query(): Query.Select {
      return super.query() as Query.Select
    }

    leftJoin<C>(
      that: Table<C> | TableSelect<C>,
      ...on: Array<EV<boolean>>
    ): SelectSingle<Row> {
      const query = this.query()
      return new SelectSingle({
        ...query,
        from: joinTarget('left', query, that, on)
      })
    }

    innerJoin<C>(
      that: Table<C> | TableSelect<C>,
      ...on: Array<EV<boolean>>
    ): SelectSingle<Row> {
      const query = this.query()
      return new SelectSingle({
        ...query,
        from: joinTarget('inner', query, that, on)
      })
    }

    select<X extends Selection>(
      selection: X
    ): SelectSingle<Selection.Infer<X>> {
      return new SelectSingle({
        ...this.query(),
        selection: ExprData.create(selection)
      })
    }

    orderBy(...orderBy: Array<OrderBy>): SelectSingle<Row> {
      return new SelectSingle({
        ...this.query(),
        orderBy
      })
    }

    groupBy(...groupBy: Array<Expr<any>>): SelectSingle<Row> {
      return new SelectSingle({
        ...this.query(),
        groupBy: groupBy.map(ExprData.create)
      })
    }

    where(...where: Array<EV<boolean>>): SelectSingle<Row> {
      return new SelectSingle(addWhere(this.query(), where))
    }

    take(limit: number | undefined): SelectSingle<Row> {
      return new SelectSingle({...this.query(), limit})
    }

    skip(offset: number | undefined): SelectSingle<Row> {
      return new SelectSingle({...this.query(), offset})
    }

    all(): SelectMultiple<Row> {
      return new SelectMultiple({...this.query(), singleResult: false})
    }

    [Expr.toExpr](): Expr<Row> {
      return new Expr<Row>(ExprData.Query(this.query()))
    }
  }
}
