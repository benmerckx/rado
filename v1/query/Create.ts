import {Is, getSql, type IsSql} from '../Is.ts'
import {sql} from '../Sql.ts'
import type {TableApi} from '../Table.ts'

interface CreateData {
  table: TableApi
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
    const {table, ifNotExists} = this.#data
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
