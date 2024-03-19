import {getTable, meta, type HasTable} from '../Meta.ts'
import {Query, QueryData, QueryMode} from '../Query.ts'
import {sql} from '../Sql.ts'

interface CreateData extends QueryData {
  table: HasTable
  ifNotExists?: boolean
}

export class Create<Mode extends QueryMode> extends Query<void, Mode> {
  #data: CreateData

  constructor(data: CreateData) {
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
