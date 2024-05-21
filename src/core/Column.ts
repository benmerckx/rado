import type {HasSql} from './Internal.ts'
import {getData, getField, internalData} from './Internal.ts'
import type {Sql} from './Sql.ts'
import type {Field, FieldData} from './expr/Field.ts'
import {input, type Input} from './expr/Input.ts'

export interface ColumnData {
  type: Sql
  name?: string
  json?: boolean
  primary?: boolean
  notNull?: boolean
  isUnique?: boolean
  autoIncrement?: boolean
  defaultValue?(): HasSql
  references?(): FieldData
  onUpdate?: HasSql
  onDelete?: HasSql
  mapFromDriverValue?(value: unknown): unknown
  mapToDriverValue?(value: unknown): unknown
}

export class Column<Value = unknown> {
  readonly [internalData]: ColumnData
  constructor(data: ColumnData) {
    this[internalData] = data
  }
  notNull(): RequiredColumn<NonNullable<Value>> {
    return new Column({
      ...getData(this),
      notNull: true
    }) as RequiredColumn
  }
  default(
    value: Input<NonNullable<Value>> | (() => Input<NonNullable<Value>>)
  ): Column<NonNullable<Value>> {
    return new Column({
      ...getData(this),
      defaultValue(): HasSql {
        return input(value instanceof Function ? value() : value)
      }
    })
  }
  primaryKey(): Column<NonNullable<Value>> {
    return new Column({...getData(this), primary: true})
  }
  unique(name?: string): Column<Value> {
    return new Column({...getData(this), isUnique: true})
  }
  references(foreignField: Field | (() => Field)): Column<Value> {
    return new Column<Value>({
      ...getData(this),
      references() {
        return getField(
          typeof foreignField === 'function' ? foreignField() : foreignField
        )
      }
    })
  }
}

export class JsonColumn<Value = unknown> extends Column<Value> {
  private declare brand: [Value]
  constructor(data: ColumnData) {
    super({...data, json: true})
  }
}

declare const required: unique symbol
export interface RequiredColumn<Value = unknown> extends Column<Value> {
  [required]: true
}
