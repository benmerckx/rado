import {input, type Input} from './Expr.ts'
import {Is, type IsColumn, type IsSql} from './Is.ts'
import {sql} from './Sql.ts'

const {assign} = Object

class ColumnData {
  type!: IsSql
  name?: string
  primary?: boolean
  notNull?: boolean
  isUnique?: boolean
  autoIncrement?: boolean
  defaultValue?(): IsSql
  references?(): IsSql
  onUpdate?: IsSql
  onDelete?: IsSql
  mapFromDriverValue?(value: unknown): unknown
  mapToDriverValue?(value: unknown): unknown
}

export class ColumnApi extends ColumnData {
  sqlType(): IsSql {
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

export class Column<T = unknown> implements IsColumn {
  readonly [Is.column]: ColumnApi
  constructor(data: ColumnData) {
    this[Is.column] = assign(new ColumnApi(), data)
  }
  notNull(): Column<NonNullable<T>> {
    return new Column({...this[Is.column], notNull: true})
  }
  default(
    value: Input<NonNullable<T>> | (() => Input<NonNullable<T>>)
  ): Column<NonNullable<T>> {
    return new Column({
      ...this[Is.column],
      defaultValue(): IsSql {
        return input(value instanceof Function ? value() : value)
      }
    })
  }
  primaryKey(): Column<NonNullable<T>> {
    return new Column({...this[Is.column], primary: true})
  }
  unique(name?: string): Column<T> {
    return new Column({...this[Is.column], isUnique: true})
  }
}
