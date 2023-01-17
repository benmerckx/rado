import {Cursor} from './Cursor'
import {ExprData} from './Expr'
import {Query} from './Query'
import {Schema} from './Schema'
import {Table} from './Table'
import {Target} from './Target'

export function selectAll<Row>(table: Table<Row>): Cursor.SelectMultiple<Row> {
  return new Cursor.SelectMultiple<Row>(
    Query.Select({
      from: Target.Table(table.schema()),
      selection: ExprData.Row(Target.Table(table.schema()))
    })
  )
}

export function selectFirst<Row>(table: Table<Row>): Cursor.SelectSingle<Row> {
  return new Cursor.SelectSingle<Row>(
    Query.Select({
      from: Target.Table(table.schema()),
      selection: ExprData.Row(Target.Table(table.schema())),
      singleResult: true
    })
  )
}

export function update<Row>(table: Table<Row>): Cursor.Update<Row> {
  return new Cursor.Update<Row>(Query.Update({table: table.schema()}))
}

export function insertInto<Row>(table: Table<Row>): Cursor.Insert<Row> {
  return new Cursor.Insert<Row>(table.schema())
}

export function deleteFrom<Row>(table: Table<Row>): Cursor.Delete {
  return new Cursor.Delete(Query.Delete({table: table.schema()}))
}

export function create(...tables: Array<Table<any>>): Cursor.Batch {
  return new Cursor.Batch(
    tables.flatMap(table => Schema.create(table.schema()).queries)
  )
}
