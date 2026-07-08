import type {Field} from './expr/Field.ts'
import {type HasData, type HasSql, getData, internalData} from './Internal.ts'
import {type Sql, sql} from './Sql.ts'

class IndexData {
  name?: string
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
    const fields = this.fields.map(field =>
      sql.join([
        field,
        this.order && sql.unsafe(this.order),
        this.nulls && sql`nulls ${sql.unsafe(this.nulls)}`
      ])
    )
    return sql
      .join([
        sql`create`,
        this.unique && sql`unique`,
        sql`index`,
        this.concurrently && sql`concurrently`,
        ifNotExists && sql`if not exists`,
        sql.identifier(indexName),
        sql`on`,
        this.only && sql`only`,
        sql.identifier(tableName),
        this.using && sql`using ${this.using}`,
        sql`(${sql.join(fields, sql`, `)})`,
        this.where && sql`where ${this.where}`
      ])
      .inlineFields(false)
  }
}

export class Index implements HasData<IndexData> {
  [internalData]: IndexApi

  constructor(data: IndexData) {
    this[internalData] = Object.assign(new IndexApi(), data)
  }

  on(...fields: Array<Field | HasSql>): Index {
    return new Index({...getData(this), fields})
  }

  concurrently(): Index {
    return new Index({...getData(this), concurrently: true})
  }

  only(): Index {
    return new Index({...getData(this), only: true})
  }

  using<Sql>(using: HasSql<Sql>): Index {
    return new Index({...getData(this), using})
  }

  asc(): Index {
    return new Index({...getData(this), order: 'asc'})
  }

  desc(): Index {
    return new Index({...getData(this), order: 'desc'})
  }

  nullsFirst(): Index {
    return new Index({...getData(this), nulls: 'first'})
  }

  nullsLast(): Index {
    return new Index({...getData(this), nulls: 'last'})
  }

  where(where: HasSql<boolean>): Index {
    return new Index({...getData(this), where})
  }
}

export function index(name?: string): Index {
  return new Index({name, fields: []})
}

export function uniqueIndex(name?: string): Index {
  return new Index({name, fields: [], unique: true})
}
