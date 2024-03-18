import {HasQuery, HasTable, getTable, meta} from '../Meta.ts'
import {sql} from '../Sql.ts'

interface CreateData {
  table: HasTable
  ifNotExists?: boolean
}

export class Create implements HasQuery {
  #data: CreateData

  constructor(data: CreateData) {
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
