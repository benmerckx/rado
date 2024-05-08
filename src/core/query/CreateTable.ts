import {
  getData,
  internalData,
  internalQuery,
  type HasTable
} from '../Internal.ts'
import type {QueryMeta} from '../MetaData.ts'
import {Query, type QueryData} from '../Query.ts'
import {sql} from '../Sql.ts'

export interface CreateData<Meta extends QueryMeta> extends QueryData<Meta> {
  table: HasTable
  ifNotExists?: boolean
}

export class Create<Meta extends QueryMeta = QueryMeta> extends Query<
  void,
  Meta
> {
  readonly [internalData]: CreateData<Meta>

  constructor(data: CreateData<Meta>) {
    super(data)
    this[internalData] = data
  }

  ifNotExists() {
    return new Create<Meta>({...getData(this), ifNotExists: true})
  }

  get [internalQuery]() {
    return sql.chunk('emitCreateTable', this)
  }
}