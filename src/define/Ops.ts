import {ExprData} from './Expr.js'
import {
  Batch,
  Delete,
  InsertInto,
  Query,
  QueryData,
  RecursiveUnion,
  Select,
  Update
} from './Query.js'
import {Schema} from './Schema.js'
import {Selection} from './Selection.js'
import {Table, createTable} from './Table.js'
import {Target} from './Target.js'

export function withRecursive<Row>(initialSelect: Select<Row>) {
  return new RecursiveUnion<Row>(initialSelect[Query.Data])
}

export function alias<T extends Table<{}>>(table: T): Record<string, T> {
  return new Proxy(Object.create(null), {
    get(_, alias: string) {
      return createTable({...table[Table.Data], alias})
    }
  })
}

export function select<X extends Selection>(
  selection: X
): Select<Selection.Infer<X>> {
  return new Select(
    new QueryData.Select({
      selection: ExprData.create(selection)
    })
  )
}

export function from<Row>(source: Table<Row> | Select<Row>): Select<Row> {
  const target = Query.isQuery(source)
    ? new Target.Query(source[Query.Data])
    : new Target.Table(source[Table.Data])
  return new Select<Row>(
    new QueryData.Select({
      from: target,
      selection: new ExprData.Row(target)
    })
  )
}

export function update<Definition>(
  table: Table<Definition>
): Update<Definition> {
  return new Update<Definition>(
    new QueryData.Update({table: table[Table.Data]})
  )
}

export function insertInto<Definition>(
  table: Table<Definition>
): InsertInto<Definition> {
  return new InsertInto<Definition>(table[Table.Data])
}

export function deleteFrom<Row>(table: Table<Row>): Delete {
  return new Delete(new QueryData.Delete({table: table[Table.Data]}))
}

export function create(...tables: Array<Table<any>>): Batch {
  return new Batch(
    tables.flatMap(table => Schema.create(table[Table.Data]).queries)
  )
}
