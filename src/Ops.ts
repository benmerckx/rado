import {Collection} from './Collection'
import {Cursor} from './Cursor'
import {ExprData} from './Expr'
import {Query} from './Query'
import {Target} from './Target'

export function selectAll<Row>(
  collection: Collection<Row>
): Cursor.SelectMultiple<Row> {
  return new Cursor.SelectMultiple<Row>(
    Query.Select({
      from: Target.Collection(collection.data()),
      selection: ExprData.Row(Target.Collection(collection.data()))
    })
  )
}

export function selectFirst<Row>(
  collection: Collection<Row>
): Cursor.SelectSingle<Row> {
  return new Cursor.SelectSingle<Row>(
    Query.Select({
      from: Target.Collection(collection.data()),
      selection: ExprData.Row(Target.Collection(collection.data())),
      singleResult: true
    })
  )
}

export function update<Row>(collection: Collection<Row>): Cursor.Update<Row> {
  return new Cursor.Update<Row>(Query.Update({collection: collection.data()}))
}

export function insertInto<Row>(
  collection: Collection<Row>
): Cursor.Insert<Row> {
  return new Cursor.Insert<Row>(collection.data())
}

export function deleteFrom<Row>(
  collection: Collection<Row>
): Cursor.Delete<Row> {
  return new Cursor.Delete<Row>(Query.Delete({collection: collection.data()}))
}

export function create(...collections: Array<Collection<any>>): Cursor.Batch {
  return new Cursor.Batch(
    collections.map(collection =>
      Query.CreateTable({collection: collection.data(), ifNotExists: true})
    )
  )
}
