import {makeRecursiveUnion} from '../CTE'
import {EV, Expr, ExprData} from '../Expr'
import {Functions} from '../Functions'
import {OrderBy} from '../OrderBy'
import {Query, QueryData} from '../Query'
import {Selection} from '../Selection'
import {Table, TableData, createTable} from '../Table'
import {Target} from '../Target'
import {CreateTable} from './CreateTable'
import {Delete} from './Delete'
import {Insert, Inserted} from './Insert'
import {Union} from './Union'
import {Update} from './Update'

function joinTarget(
  joinType: 'left' | 'inner',
  query: QueryData.Select,
  to: Table<any> | TableSelect<any>,
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

export class SelectMultiple<Row> extends Union<Row> {
  declare [Query.Data]: QueryData.Select

  constructor(query: QueryData.Select) {
    super(query)
  }

  from(table: Table<any>): SelectMultiple<Row> {
    return new SelectMultiple(
      this[Query.Data].with({from: new Target.Table(table)})
    )
  }

  leftJoin<C>(
    that: Table<C> | TableSelect<C>,
    ...on: Array<EV<boolean>>
  ): SelectMultiple<Row> {
    const query = this[Query.Data]
    return new SelectMultiple(
      this[Query.Data].with({
        from: joinTarget('left', query, that, on)
      })
    )
  }

  innerJoin<C>(
    that: Table<C> | TableSelect<C>,
    ...on: Array<EV<boolean>>
  ): SelectMultiple<Row> {
    const query = this[Query.Data]
    return new SelectMultiple(
      this[Query.Data].with({
        from: joinTarget('inner', query, that, on)
      })
    )
  }

  select<X extends Selection>(
    selection: X
  ): SelectMultiple<Selection.Infer<X>> {
    return new SelectMultiple(
      this[Query.Data].with({
        selection: ExprData.create(selection)
      })
    )
  }

  count(): SelectSingle<number> {
    return new SelectSingle(
      this[Query.Data].with({
        selection: Functions.count()[Expr.Data],
        singleResult: true
      })
    )
  }

  orderBy(...orderBy: Array<Expr<any> | OrderBy>): SelectMultiple<Row> {
    return new SelectMultiple(
      this[Query.Data].with({
        orderBy: orderBy.map((e): OrderBy => {
          return Expr.isExpr<any>(e) ? e.asc() : e
        })
      })
    )
  }

  groupBy(...groupBy: Array<Expr<any>>): SelectMultiple<Row> {
    return new SelectMultiple(
      this[Query.Data].with({
        groupBy: groupBy.map(ExprData.create)
      })
    )
  }

  maybeFirst(): SelectSingle<Row | undefined> {
    return new SelectSingle(this[Query.Data].with({singleResult: true}))
  }

  first(): SelectSingle<Row> {
    return new SelectSingle(
      this[Query.Data].with({
        singleResult: true,
        validate: true
      })
    )
  }

  where(...where: Array<EV<boolean>>): SelectMultiple<Row> {
    return new SelectMultiple(this.addWhere(where))
  }

  take(limit: number | undefined): SelectMultiple<Row> {
    return new SelectMultiple(this[Query.Data].with({limit}))
  }

  skip(offset: number | undefined): SelectMultiple<Row> {
    return new SelectMultiple(this[Query.Data].with({offset}))
  }

  recursiveUnion<T extends {}>(
    this: SelectMultiple<T>,
    create: (
      fields: Record<string, Table.Of<T>>
    ) => SelectMultiple<T> | Union<T>
  ): SelectMultiple<T> {
    return new SelectMultiple(
      makeRecursiveUnion(
        this[Query.Data],
        create,
        QueryData.UnionOperation.Union
      )
    )
  }

  recursiveUnionAll<T extends {}>(
    this: SelectMultiple<T>,
    create: (
      fields: Record<string, Table.Of<T>>
    ) => SelectMultiple<T> | Union<T>
  ): SelectMultiple<T> {
    return new SelectMultiple(
      makeRecursiveUnion(
        this[Query.Data],
        create,
        QueryData.UnionOperation.UnionAll
      )
    )
  }

  [Expr.ToExpr](): Expr<Row> {
    return new Expr<Row>(new ExprData.Query(this[Query.Data]))
  }
}

export class TableSelect<Definition> extends SelectMultiple<
  Table.Select<Definition>
> {
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

  insertSelect(query: SelectMultiple<Table.Insert<Definition>>) {
    return new Inserted(
      new QueryData.Insert({into: this.table, select: query[Query.Data]})
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
    return new Insert<Definition>(this.table).values(...data)
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

export class SelectSingle<Row> extends Query<Row> {
  declare [Query.Data]: QueryData.Select

  constructor(query: QueryData.Select) {
    super(query)
  }

  from(table: Table<any>): SelectMultiple<Row> {
    return new SelectMultiple(
      this[Query.Data].with({from: new Target.Table(table)})
    )
  }

  leftJoin<C>(
    that: Table<C> | TableSelect<C>,
    ...on: Array<EV<boolean>>
  ): SelectSingle<Row> {
    const query = this[Query.Data]
    return new SelectSingle(
      this[Query.Data].with({
        from: joinTarget('left', query, that, on)
      })
    )
  }

  innerJoin<C>(
    that: Table<C> | TableSelect<C>,
    ...on: Array<EV<boolean>>
  ): SelectSingle<Row> {
    const query = this[Query.Data]
    return new SelectSingle(
      this[Query.Data].with({
        from: joinTarget('inner', query, that, on)
      })
    )
  }

  select<X extends Selection>(selection: X): SelectSingle<Selection.Infer<X>> {
    return new SelectSingle(
      this[Query.Data].with({
        selection: ExprData.create(selection)
      })
    )
  }

  orderBy(...orderBy: Array<OrderBy>): SelectSingle<Row> {
    return new SelectSingle(
      this[Query.Data].with({
        orderBy
      })
    )
  }

  groupBy(...groupBy: Array<Expr<any>>): SelectSingle<Row> {
    return new SelectSingle(
      this[Query.Data].with({
        groupBy: groupBy.map(ExprData.create)
      })
    )
  }

  where(...where: Array<EV<boolean>>): SelectSingle<Row> {
    return new SelectSingle(this.addWhere(where))
  }

  take(limit: number | undefined): SelectSingle<Row> {
    return new SelectSingle(this[Query.Data].with({limit}))
  }

  skip(offset: number | undefined): SelectSingle<Row> {
    return new SelectSingle(this[Query.Data].with({offset}))
  }

  all(): SelectMultiple<Row> {
    return new SelectMultiple(this[Query.Data].with({singleResult: false}))
  }

  [Expr.ToExpr](): Expr<Row> {
    return new Expr<Row>(new ExprData.Query(this[Query.Data]))
  }
}
