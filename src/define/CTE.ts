import {Expr, ExprData, ExprType} from './Expr'
import {Query, QueryData} from './Query'
import {virtualTable} from './Table'
import {Target, TargetType} from './Target'

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

export function makeRecursiveUnion<T extends Query<any>>(
  initial: QueryData.Select,
  createUnion: (target: any) => T,
  operator: QueryData.UnionOperation
): QueryData.Select {
  let name: string | undefined
  const alias = new Proxy(create(null), {
    get(_, key: string) {
      name = key
      return virtualTable(name)
    }
  })
  const right = <QueryData.Union | QueryData.Select>(
    createUnion(alias)[Query.Data]
  )
  if (!name) throw new TypeError('No CTE name provided')
  const cte = alias[name]
  const cols = columnsOf(initial.selection)
  const selection = new ExprData.Record(
    fromEntries(cols.map(col => [col, cte[col][Expr.Data]]))
  )
  const union = new QueryData.Union({
    a: initial,
    operator,
    b: right
  })
  const from = new Target.CTE(name, union)
  return new QueryData.Select({
    selection,
    from
  })
}
