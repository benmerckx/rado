import {type HasSql, internalField, internalSql} from '../Internal.ts'
import type {SelectionRecord} from '../Selection.ts'
import {type Decoder, type Sql, sql} from '../Sql.ts'

export interface FieldData {
  targetName: string
  fieldName: string
  source: Decoder
  schemaName?: string
}

export class Field<
  Value = unknown,
  Table extends string = string
> implements HasSql<Value> {
  declare private brand: [Table]
  readonly [internalField]: FieldData
  readonly [internalSql]: Sql<Value>
  constructor(
    targetName: string,
    fieldName: string,
    source: Decoder<Value> = {},
    schemaName?: string
  ) {
    const field: FieldData = {targetName, fieldName, source}
    if (schemaName) field.schemaName = schemaName
    this[internalField] = field
    const expr = sql.field(field).as(fieldName).mapWith<Value>(source)
    this[internalSql] = expr
  }
}

// The table a foreign key points at
export function referenced(field: FieldData): Sql {
  const table = sql.identifier(field.targetName)
  return field.schemaName
    ? sql`${sql.identifier(field.schemaName)}.${table}`
    : table
}

export type StripFieldMeta<Input> =
  Input extends HasSql<infer Value>
    ? HasSql<Value>
    : Input extends SelectionRecord
      ? {[Key in keyof Input]: StripFieldMeta<Input[Key]>}
      : Input
