import {internalField, internalSql, type HasSql} from '../Internal.ts'
import {sql, type Sql} from '../Sql.ts'

export interface FieldData {
  targetName: string
  fieldName: string
}

export class Field<Value = unknown, Table extends string = string>
  implements HasSql<Value>
{
  private declare brand: [Table]
  readonly [internalField]: FieldData
  readonly [internalSql]: Sql<Value>
  constructor(
    targetName: string,
    fieldName: string,
    options: {mapFromDriverValue?(value: unknown): Value} = {}
  ) {
    const field = {targetName, fieldName}
    this[internalField] = field
    const expr = sql.field(field).as(fieldName).mapWith(options)
    this[internalSql] = expr
  }
}
