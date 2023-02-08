import {Cursor} from './Cursor'
import {ExprData} from './Expr'
import {Query} from './Query'
import {Schema} from './Schema'
import {Selection} from './Selection'
import {Table, table as createTable} from './Table'
import {Target} from './Target'

export function select<X extends Selection>(
  selection: X
): Cursor.SelectMultiple<Selection.Infer<X>> {
  return new Cursor.SelectMultiple(
    Query.Select({
      selection: ExprData.create(selection)
    })
  )
}

export function from<Row>(
  source: Table<Row> | Cursor.SelectMultiple<Row>
): Cursor.SelectMultiple<Row> {
  const target =
    source instanceof Cursor
      ? Target.Query(source.query())
      : Target.Table(source[createTable.data])
  return new Cursor.SelectMultiple<Row>(
    Query.Select({
      from: target,
      selection: ExprData.Row(target)
    })
  )
}

export function update<Row>(table: Table<Row>): Cursor.Update<Row> {
  return new Cursor.Update<Row>(Query.Update({table: table[createTable.data]}))
}

export function insertInto<Row>(table: Table<Row>): Cursor.Insert<Row> {
  return new Cursor.Insert<Row>(table[createTable.data])
}

export function deleteFrom<Row>(table: Table<Row>): Cursor.Delete {
  return new Cursor.Delete(Query.Delete({table: table[createTable.data]}))
}

export function create(...tables: Array<Table<any>>): Cursor.Batch {
  return new Cursor.Batch(
    tables.flatMap(table => Schema.create(table[createTable.data]).queries)
  )
}
