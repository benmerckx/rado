import {type HasTable, getData, getTable, internal} from '../Internal.ts'
import {Query, type QueryData, type QueryMeta} from '../Query.ts'
import {sql} from '../Sql.ts'
import type {Table, TableDefinition} from '../Table.ts'

interface CreateData<Meta extends QueryMeta> extends QueryData<Meta> {
  table: HasTable
  ifNotExists?: boolean
}

export class Create<Meta extends QueryMeta> extends Query<void, Meta> {
  readonly [internal.data]: CreateData<Meta>

  constructor(data: CreateData<Meta>) {
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
): Create<QueryMeta> {
  return new Create({table})
}
