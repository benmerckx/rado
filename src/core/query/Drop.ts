import {
  getData,
  internalData,
  internalQuery,
  type HasTable
} from '../Internal.ts'
import type {QueryMeta} from '../MetaData.ts'
import {Query, type QueryData} from '../Query.ts'
import {sql} from '../Sql.ts'

export interface DropData<Meta extends QueryMeta> extends QueryData<Meta> {
  table: HasTable
  ifExists?: boolean
}

export class Drop<Meta extends QueryMeta = QueryMeta> extends Query<
  void,
  Meta
> {
  readonly [internalData]: DropData<Meta>

  constructor(data: DropData<Meta>) {
    super(data)
    this[internalData] = data
  }

  ifExists() {
    return new Drop<Meta>({...getData(this), ifExists: true})
  }

  get [internalQuery]() {
    return sql.chunk('emitDrop', this)
  }
}
