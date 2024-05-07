import {
  getData,
  getField,
  internalData,
  type HasData,
  type HasSql
} from './Internal.ts'
import type {Field, FieldData} from './expr/Field.ts'

export interface IndexData {
  fields: Array<FieldData>
  unique?: boolean
  concurrently?: boolean
  only?: boolean
  using?: HasSql
  order?: 'asc' | 'desc'
  nulls?: 'first' | 'last'
  where?: HasSql
}

export class Index<TableName extends string = string>
  implements HasData<IndexData>
{
  private declare brand: [TableName];
  [internalData]: IndexData

  constructor(data: IndexData) {
    this[internalData] = data
  }

  on<TableName extends string>(
    ...columns: Array<Field<unknown, TableName>>
  ): Index<TableName> {
    const fields = columns.map(getField)
    return new Index({...getData(this), fields})
  }

  concurrently() {
    return new Index({...getData(this), concurrently: true})
  }

  only() {
    return new Index({...getData(this), only: true})
  }

  using<Sql>(using: HasSql<Sql>) {
    return new Index({...getData(this), using})
  }

  asc() {
    return new Index({...getData(this), order: 'asc'})
  }

  desc() {
    return new Index({...getData(this), order: 'desc'})
  }

  nullsFirst() {
    return new Index({...getData(this), nulls: 'first'})
  }

  nullsLast() {
    return new Index({...getData(this), nulls: 'last'})
  }

  where(where: HasSql<boolean>) {
    return new Index({...getData(this), where})
  }
}

export function index() {
  return new Index({fields: []})
}

export function uniqueIndex() {
  return new Index({fields: [], unique: true})
}
