import {input, type Input} from './Expr.ts'
import {meta, type HasColumn} from './Meta.ts'
import {sql, type Sql} from './Sql.ts'

const {assign} = Object

class ColumnData {
  type!: Sql
  name?: string
  primary?: boolean
  notNull?: boolean
  isUnique?: boolean
  autoIncrement?: boolean
  defaultValue?(): Sql
  references?(): Sql
  onUpdate?: Sql
  onDelete?: Sql
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
  readonly [meta.column]: ColumnApi
  constructor(data: ColumnData) {
    this[meta.column] = assign(new ColumnApi(), data)
  }
  notNull(): RequiredColumn<NonNullable<Value>> {
    return new Column({
      ...this[meta.column],
      notNull: true
    }) as RequiredColumn
  }
  default(
    value: Input<NonNullable<Value>> | (() => Input<NonNullable<Value>>)
  ): Column<NonNullable<Value>> {
    return new Column({
      ...this[meta.column],
      defaultValue(): Sql {
        return input(value instanceof Function ? value() : value)
      }
    })
  }
  primaryKey(): Column<NonNullable<Value>> {
    return new Column({...this[meta.column], primary: true})
  }
  unique(name?: string): Column<Value> {
    return new Column({...this[meta.column], isUnique: true})
  }
}

declare const required: unique symbol
export interface RequiredColumn<Value = unknown> extends Column<Value> {
  [required]: true
}
