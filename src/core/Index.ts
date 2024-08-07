import {getData, internalData, type HasData, type HasSql} from './Internal.ts'
import {sql, type Sql} from './Sql.ts'
import type {Field} from './expr/Field.ts'

class IndexData {
  fields!: Array<HasSql>
  concurrently?: boolean
  unique?: boolean
  only?: boolean
  using?: HasSql
  order?: 'asc' | 'desc'
  nulls?: 'first' | 'last'
  where?: HasSql
}

export class IndexApi extends IndexData {
  toSql(tableName: string, indexName: string, ifNotExists: boolean): Sql {
    return sql
      .join([
        sql`create`,
        this.unique && sql`unique`,
        sql`index`,
        ifNotExists && sql`if not exists`,
        sql.identifier(indexName),
        sql`on`,
        sql`${sql.identifier(tableName)}(${sql.join(this.fields, sql`, `)})`,
        this.where && sql`where ${this.where}`
      ])
      .inlineFields(false)
  }
}

export class Index<TableName extends string = string>
  implements HasData<IndexData>
{
  private declare brand: [TableName];
  [internalData]: IndexApi

  constructor(data: IndexData) {
    this[internalData] = Object.assign(new IndexApi(), data)
  }

  on<TableName extends string>(
    ...fields: Array<Field<unknown, TableName> | HasSql>
  ): Index<TableName> {
    return new Index({...getData(this), fields})
  }

  concurrently(): Index<TableName> {
    return new Index({...getData(this), concurrently: true})
  }

  only(): Index<TableName> {
    return new Index({...getData(this), only: true})
  }

  using<Sql>(using: HasSql<Sql>): Index<TableName> {
    return new Index({...getData(this), using})
  }

  asc(): Index<TableName> {
    return new Index({...getData(this), order: 'asc'})
  }

  desc(): Index<TableName> {
    return new Index({...getData(this), order: 'desc'})
  }

  nullsFirst(): Index<TableName> {
    return new Index({...getData(this), nulls: 'first'})
  }

  nullsLast(): Index<TableName> {
    return new Index({...getData(this), nulls: 'last'})
  }

  where(where: HasSql<boolean>): Index<TableName> {
    return new Index({...getData(this), where})
  }
}

export function index(): Index<string> {
  return new Index({fields: []})
}

export function uniqueIndex(): Index<string> {
  return new Index({fields: [], unique: true})
}
