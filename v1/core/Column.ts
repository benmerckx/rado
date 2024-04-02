import {type Input, input} from './Expr.ts'
import type {HasColumn, HasSql} from './Internal.ts'
import {internalColumn} from './Internal.ts'
import {type Sql, sql} from './Sql.ts'

class ColumnData {
  type!: Sql
  name?: string
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

export class ColumnApi extends ColumnData {
  sqlType(): Sql {
    return sql.join([
      this.type,
      this.primary && sql`primary key`,
      this.notNull && sql`not null`,
      this.isUnique && sql`unique`,
      this.autoIncrement && sql`autoincrement`,
      this.defaultValue && sql`default ${this.defaultValue()}`,
      this.references && sql`references ${this.references()}`,
      this.onUpdate && sql`on update ${this.onUpdate}`,
      this.onDelete && sql`on delete ${this.onDelete}`
    ])
  }
}

export class Column<Value = unknown> implements HasColumn {
  readonly [internalColumn]: ColumnApi
  constructor(data: ColumnData) {
    this[internalColumn] = Object.assign(new ColumnApi(), data)
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

declare const required: unique symbol
export interface RequiredColumn<Value = unknown> extends Column<Value> {
  [required]: true
}
