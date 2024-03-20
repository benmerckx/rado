import {getData, getTable, internal, type HasTable} from '../Internal.ts'
import {Query, type QueryData, type QueryMode} from '../Query.ts'
import {sql} from '../Sql.ts'
import type {Table, TableDefinition} from '../Table.ts'

interface CreateData<Mode extends QueryMode> extends QueryData<Mode> {
  table: HasTable
  ifNotExists?: boolean
}

export class Create<Mode extends QueryMode> extends Query<void, Mode> {
  readonly [internal.data]: CreateData<Mode>

  constructor(data: CreateData<Mode>) {
    super(data)
    this[internal.data] = data
  }

  ifNotExists() {
    return new Create({...getData(this), ifNotExists: true})
  }

  get [internal.query]() {
    const {ifNotExists} = getData(this)
    const table = getTable(getData(this).table)
    return sql.join([
      sql`create table`,
      ifNotExists ? sql`if not exists` : undefined,
      sql.identifier(table.name),
      sql`(${table.createColumns()})`
    ])
  }
}

export function create<Definition extends TableDefinition>(
  table: Table<Definition>
): Create<undefined> {
  return new Create({table})
}
