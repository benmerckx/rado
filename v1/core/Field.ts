import type {ColumnApi} from './Column.ts'
import {internal, type HasField, type HasSql} from './Internal.ts'
import {sql, type Sql} from './Sql.ts'

export class FieldApi {
  constructor(public tableName: string, public fieldName: string) {}

  toSql(): Sql {
    return sql`${sql.identifier(this.tableName)}.${sql.identifier(
      this.fieldName
    )}`
  }
}

export class Field<Value, Table extends string>
  implements HasField, HasSql<Value>
{
  #table?: Table;
  readonly [internal.field]: FieldApi;
  readonly [internal.sql]: Sql<Value>
  constructor(columnApi: ColumnApi, tableName: string, fieldName: string) {
    const api = new FieldApi(tableName, fieldName)
    this[internal.field] = api
    this[internal.sql] = sql.field(api).mapWith(columnApi) as Sql<Value>
  }
}
