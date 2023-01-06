import {Cursor} from './Cursor'
import {ExprData} from './Expr'
import {Query} from './Query'
import {Table} from './Table'
import {Target} from './Target'

export function selectAll<Row>(table: Table<Row>): Cursor.SelectMultiple<Row> {
  return new Cursor.SelectMultiple<Row>(
    Query.Select({
      from: Target.Table(table.data()),
      selection: ExprData.Row(Target.Table(table.data()))
    })
  )
}

export function selectFirst<Row>(table: Table<Row>): Cursor.SelectSingle<Row> {
  return new Cursor.SelectSingle<Row>(
    Query.Select({
      from: Target.Table(table.data()),
      selection: ExprData.Row(Target.Table(table.data())),
      singleResult: true
    })
  )
}

export function update<Row>(table: Table<Row>): Cursor.Update<Row> {
  return new Cursor.Update<Row>(Query.Update({table: table.data()}))
}

export function insertInto<Row>(table: Table<Row>): Cursor.Insert<Row> {
  return new Cursor.Insert<Row>(table.data())
}

export function deleteFrom<Row>(table: Table<Row>): Cursor.Delete<Row> {
  return new Cursor.Delete<Row>(Query.Delete({table: table.data()}))
}

export function create(...tables: Array<Table<any>>): Cursor.Batch {
  return new Cursor.Batch(
    tables.map(table =>
      Query.CreateTable({table: table.data(), ifNotExists: true})
    )
  )
}
