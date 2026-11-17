import {type HasSql, internalField, internalSql} from '../Internal.ts'
import type {SelectionRecord} from '../Selection.ts'
import {type Decoder, type Sql, sql} from '../Sql.ts'

export interface FieldData {
  targetName: string
  fieldName: string
  source: Decoder
  // The property a table has this field under, unlike a renamed column
  key?: string
}

export class Field<
  Value = unknown,
  Table extends string = string,
  Key extends string = string
> implements HasSql<Value> {
  declare private brand: [Table, Key]
  readonly [internalField]: FieldData
  readonly [internalSql]: Sql<Value>
  constructor(
    targetName: string,
    fieldName: string,
    source: Decoder<Value> = {},
    key?: string
  ) {
    const field = {targetName, fieldName, source, key}
    this[internalField] = field
    const expr = sql.field(field).as(fieldName).mapWith<Value>(source)
    this[internalSql] = expr
  }
}

export type StripFieldMeta<Input> =
  Input extends HasSql<infer Value>
    ? HasSql<Value>
    : Input extends SelectionRecord
      ? {[Key in keyof Input]: StripFieldMeta<Input[Key]>}
      : Input
