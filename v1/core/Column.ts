import {input, type Input} from './Expr.ts'
import type {HasColumn, HasSql} from './Internal.ts'
import {internalColumn} from './Internal.ts'
import type {Sql} from './Sql.ts'

export class ColumnData {
  type!: Sql
  name?: string
  json?: boolean
  primary?: boolean
  notNull?: boolean
  isUnique?: boolean
  autoIncrement?: boolean
  defaultValue?(): HasSql
  references?(): HasSql
  onUpdate?: HasSql
  onDelete?: HasSql
  mapFromDriverValue?(value: unknown): unknown
  mapToDriverValue?(value: unknown): unknown
}

export class Column<Value = unknown> implements HasColumn {
  readonly [internalColumn]: ColumnData
  constructor(data: ColumnData) {
    this[internalColumn] = data
  }
  notNull(): RequiredColumn<NonNullable<Value>> {
    return new Column({
      ...this[internalColumn],
      notNull: true
    }) as RequiredColumn
  }
  default(
    value: Input<NonNullable<Value>> | (() => Input<NonNullable<Value>>)
  ): Column<NonNullable<Value>> {
    return new Column({
      ...this[internalColumn],
      defaultValue(): HasSql {
        return input(value instanceof Function ? value() : value)
      }
    })
  }
  primaryKey(): Column<NonNullable<Value>> {
    return new Column({...this[internalColumn], primary: true})
  }
  unique(name?: string): Column<Value> {
    return new Column({...this[internalColumn], isUnique: true})
  }
}

export class JsonColumn<Value = unknown> extends Column<Value> {
  constructor(data: ColumnData) {
    super({...data, json: true})
  }
}

declare const required: unique symbol
export interface RequiredColumn<Value = unknown> extends Column<Value> {
  [required]: true
}
