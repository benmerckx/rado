import {getTable, meta, type HasTable} from '../Meta.ts'
import {Query, type QueryData, type QueryMode} from '../Query.ts'
import {sql} from '../Sql.ts'
import type {Table, TableDefinition} from '../Table.ts'

interface CreateData<Mode extends QueryMode> extends QueryData<Mode> {
  table: HasTable
  ifNotExists?: boolean
}

export class Create<Mode extends QueryMode> extends Query<void, Mode> {
  #data: CreateData<Mode>

  constructor(data: CreateData<Mode>) {
    super(data)
    this.#data = data
  }

  ifNotExists() {
    return new Create({...this.#data, ifNotExists: true})
  }

  get [meta.query]() {
    const {ifNotExists} = this.#data
    const table = getTable(this.#data.table)
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
