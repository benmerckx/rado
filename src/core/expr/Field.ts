import {type HasSql, internalField, internalSql} from '../Internal.ts'
import type {SelectionRecord} from '../Selection.ts'
import {type Decoder, type Sql, sql} from '../Sql.ts'

export interface FieldData {
  targetName: string
  fieldName: string
  source: Decoder
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
    source: Decoder<Value> = {}
  ) {
    const field = {targetName, fieldName, source}
    this[internalField] = field
    const expr = sql.field(field).as(fieldName).mapWith<Value>(source)
    this[internalSql] = expr
  }
}

export type StripFieldMeta<Input> = Input extends HasSql<infer Value>
  ? HasSql<Value>
  : Input extends SelectionRecord
    ? {[Key in keyof Input]: StripFieldMeta<Input[Key]>}
    : Input
