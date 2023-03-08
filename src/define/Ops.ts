import {ExprData} from './Expr'
import {Query, QueryData} from './Query'
import {Schema} from './Schema'
import {Selection} from './Selection'
import {Table, createTable} from './Table'
import {Target} from './Target'
import {Batch} from './query/Batch'
import {Delete} from './query/Delete'
import {Insert} from './query/Insert'
import {Select} from './query/Select'
import {RecursiveUnion} from './query/Union'
import {Update} from './query/Update'

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

export function update<Row>(table: Table<Row>): Update<Row> {
  return new Update<Row>(new QueryData.Update({table: table[Table.Data]}))
}

export function insertInto<Row>(table: Table<Row>): Insert<Row> {
  return new Insert<Row>(table[Table.Data])
}

export function deleteFrom<Row>(table: Table<Row>): Delete {
  return new Delete(new QueryData.Delete({table: table[Table.Data]}))
}

export function create(...tables: Array<Table<any>>): Batch {
  return new Batch(
    tables.flatMap(table => Schema.create(table[Table.Data]).queries)
  )
}
