import {Cursor} from './Cursor.ts'
import {ExprData} from './Expr.ts'
import {Query} from './Query.ts'
import {Schema} from './Schema.ts'
import {Selection} from './Selection.ts'
import {Table} from './Table.ts'
import {Target} from './Target.ts'

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
      ? Target.Query(source[Cursor.Query])
      : Target.Table(source[Table.Data])
  return new Cursor.SelectMultiple<Row>(
    Query.Select({
      from: target,
      selection: ExprData.Row(target)
    })
  )
}

export function update<Row>(table: Table<Row>): Cursor.Update<Row> {
  return new Cursor.Update<Row>(Query.Update({table: table[Table.Data]}))
}

export function insertInto<Row>(table: Table<Row>): Cursor.Insert<Row> {
  return new Cursor.Insert<Row>(table[Table.Data])
}

export function deleteFrom<Row>(table: Table<Row>): Cursor.Delete {
  return new Cursor.Delete(Query.Delete({table: table[Table.Data]}))
}

export function create(...tables: Array<Table<any>>): Cursor.Batch {
  return new Cursor.Batch(
    tables.flatMap(table => Schema.create(table[Table.Data]).queries)
  )
}
