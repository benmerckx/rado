import {
  type HasTable,
  getData,
  getTable,
  internalData,
  internalQuery
} from '../Internal.ts'
import {Query, type QueryData, type QueryMeta} from '../Query.ts'
import {sql} from '../Sql.ts'

export interface CreateData<Meta extends QueryMeta> extends QueryData<Meta> {
  table: HasTable
  ifNotExists?: boolean
}

export class Create<Meta extends QueryMeta> extends Query<void, Meta> {
  readonly [internalData]: CreateData<Meta>

  constructor(data: CreateData<Meta>) {
    super(data)
    this[internalData] = data
  }

  ifNotExists() {
    return new Create({...getData(this), ifNotExists: true})
  }

  get [internalQuery]() {
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
