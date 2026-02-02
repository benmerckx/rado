import {type HasValue, internal} from '../Internal.ts'
import type {SelectionRecord} from '../Selection.ts'
import {type Decoder, type Sql, sql} from '../Sql.ts'

export interface FieldData {
  targetName: string
  fieldName: string
  source: Decoder
}

export class Field<Value = unknown, Table extends string = string>
  implements HasValue<Value>
{
  private declare brand: [Table]
  readonly [internal]: {field: FieldData; value: Sql<Value>}
  constructor(
    targetName: string,
    fieldName: string,
    source: Decoder<Value> = {}
  ) {
    const field = {targetName, fieldName, source}
    const expr = sql.field(field).as(fieldName).mapWith<Value>(source)
    this[internal] = {field, value: expr}
  }
}

export type StripFieldMeta<Input> = Input extends HasValue<infer Value>
  ? HasValue<Value>
  : Input extends SelectionRecord
    ? {[Key in keyof Input]: StripFieldMeta<Input[Key]>}
    : Input
