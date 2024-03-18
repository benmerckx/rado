import {Is, IsTable, getSql, getTable, type IsSql} from '../Is.ts'
import {sql} from '../Sql.ts'

interface CreateData {
  table: IsTable
  ifNotExists?: boolean
}

export class Create implements IsSql {
  #data: CreateData

  constructor(data: CreateData) {
    this.#data = data
  }

  ifNotExists() {
    return new Create({...this.#data, ifNotExists: true})
  }

  get [Is.sql]() {
    const {ifNotExists} = this.#data
    const table = getTable(this.#data.table)
    return getSql(
      sql.join([
        sql`create table`,
        ifNotExists ? sql`if not exists` : undefined,
        sql.identifier(table.name),
        sql`(${table.createColumns()})`
      ])
    )
  }
}
