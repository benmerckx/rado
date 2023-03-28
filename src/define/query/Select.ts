import {EV, Expr, ExprData} from '../Expr.js'
import {Functions} from '../Functions.js'
import {IndexData} from '../Index.js'
import {OrderBy} from '../OrderBy.js'
import {Query, QueryData} from '../Query.js'
import {Selection} from '../Selection.js'
import {Table} from '../Table.js'
import {Target, TargetType} from '../Target.js'
import {VirtualTable, VirtualTableData} from '../VirtualTable.js'
import {Union} from './Union.js'

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
