import {Expr} from './Expr.ts'
import {type HasField, internal} from './Internal.ts'
import {type Sql, sql} from './Sql.ts'

export class FieldApi {
  constructor(public tableName: string, public fieldName: string) {}

  toSql(): Sql {
    return sql`${sql.identifier(this.tableName)}.${sql.identifier(
      this.fieldName
    )}`
  }
}

export class Field<T, Table extends string>
  extends Expr<T>
  implements HasField
{
  #table?: Table;
  readonly [internal.field]: FieldApi
  constructor(tableName: string, fieldName: string) {
    const api = new FieldApi(tableName, fieldName)
    super(sql.field<T>(api))
    this[internal.field] = api
  }
}
