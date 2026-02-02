import {type HasValue, get, internal} from './Internal.ts'
import {type Sql, sql} from './Sql.ts'
import type {Field} from './expr/Field.ts'

class IndexData {
  fields!: Array<HasValue>
  concurrently?: boolean
  unique?: boolean
  only?: boolean
  using?: HasValue
  order?: 'asc' | 'desc'
  nulls?: 'first' | 'last'
  where?: HasValue
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
{
  private declare brand: [TableName];
  [internal]: IndexApi

  constructor(data: IndexData) {
    this[internal] = Object.assign(new IndexApi(), data)
  }

  on<TableName extends string>(
    ...fields: Array<Field<unknown, TableName> | HasValue>
  ): Index<TableName> {
    return new Index({...get(this), fields})
  }

  concurrently(): Index<TableName> {
    return new Index({...get(this), concurrently: true})
  }

  only(): Index<TableName> {
    return new Index({...get(this), only: true})
  }

  using<Sql>(using: HasValue<Sql>): Index<TableName> {
    return new Index({...get(this), using})
  }

  asc(): Index<TableName> {
    return new Index({...get(this), order: 'asc'})
  }

  desc(): Index<TableName> {
    return new Index({...get(this), order: 'desc'})
  }

  nullsFirst(): Index<TableName> {
    return new Index({...get(this), nulls: 'first'})
  }

  nullsLast(): Index<TableName> {
    return new Index({...get(this), nulls: 'last'})
  }

  where(where: HasValue<boolean>): Index<TableName> {
    return new Index({...get(this), where})
  }
}

export function index(): Index<string> {
  return new Index({fields: []})
}

export function uniqueIndex(): Index<string> {
  return new Index({fields: [], unique: true})
}
