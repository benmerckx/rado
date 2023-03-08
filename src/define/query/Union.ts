import {randomAlias} from '../../util/Alias.js'
import {EV, Expr, ExprData, ExprType} from '../Expr.js'
import {Query, QueryData} from '../Query.js'
import {Target, TargetType} from '../Target.js'
import {VirtualTable, createVirtualTable} from '../VirtualTable.js'
import {Select} from './Select.js'

const {keys, create, fromEntries} = Object

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
