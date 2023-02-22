import {ExprData} from './Expr'
import {Query, QueryData} from './Query'
import {Schema} from './Schema'
import {Selection} from './Selection'
import {Table} from './Table'
import {Target} from './Target'

export function select<X extends Selection>(
  selection: X
): Query.SelectMultiple<Selection.Infer<X>> {
  return new Query.SelectMultiple(
    new QueryData.Select({
      selection: ExprData.create(selection)
    })
  )
}

export function from<Row>(
  source: Table<Row> | Query.SelectMultiple<Row>
): Query.SelectMultiple<Row> {
  const target = Query.isQuery(source)
    ? new Target.Query(source[Query.Data])
    : new Target.Table(source[Table.Data])
  return new Query.SelectMultiple<Row>(
    new QueryData.Select({
      from: target,
      selection: new ExprData.Row(target)
    })
  )
}

export function update<Row>(table: Table<Row>): Query.Update<Row> {
  return new Query.Update<Row>(new QueryData.Update({table: table[Table.Data]}))
}

export function insertInto<Row>(table: Table<Row>): Query.Insert<Row> {
  return new Query.Insert<Row>(table[Table.Data])
}

export function deleteFrom<Row>(table: Table<Row>): Query.Delete {
  return new Query.Delete(new QueryData.Delete({table: table[Table.Data]}))
}

export function create(...tables: Array<Table<any>>): Query.Batch {
  return new Query.Batch(
    tables.flatMap(table => Schema.create(table[Table.Data]).queries)
  )
}
