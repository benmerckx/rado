import {internalField, internalSql, type HasSql} from './Internal.ts'
import {sql, type Sql} from './Sql.ts'

export class FieldApi {
  constructor(
    public targetName: string,
    public fieldName: string
  ) {}

  toSql(): Sql {
    return sql`${sql.identifier(this.targetName)}.${sql.identifier(
      this.fieldName
    )}`
  }
}

export class Field<Value, Table extends string> implements HasSql<Value> {
  #table?: Table;
  readonly [internalField]: FieldApi;
  readonly [internalSql]: Sql<Value>
  constructor(
    targetName: string,
    fieldName: string,
    options: {mapFromDriverValue?(value: unknown): unknown} = {}
  ) {
    const api = new FieldApi(targetName, fieldName)
    this[internalField] = api
    this[internalSql] = sql
      .field(api)
      .as(fieldName)
      .mapWith(options) as Sql<Value>
  }
}
