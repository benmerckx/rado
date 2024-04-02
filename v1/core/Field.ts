import type {ColumnApi} from './Column.ts'
import {type HasSql, internalField, internalSql} from './Internal.ts'
import {type Sql, sql} from './Sql.ts'

export class FieldApi {
  constructor(public tableName: string, public fieldName: string) {}

  toSql(): Sql {
    return sql`${sql.identifier(this.tableName)}.${sql.identifier(
      this.fieldName
    )}`
  }
}

export class Field<Value, Table extends string> implements HasSql<Value> {
  #table?: Table;
  readonly [internalField]: FieldApi;
  readonly [internalSql]: Sql<Value>
  constructor(columnApi: ColumnApi, tableName: string, fieldName: string) {
    const api = new FieldApi(tableName, fieldName)
    this[internalField] = api
    this[internalSql] = sql.field(api).mapWith(columnApi) as Sql<Value>
  }
}
