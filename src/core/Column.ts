import type {DriverSpecs} from './Driver.ts'
import type {HasSql} from './Internal.ts'
import {getData, getField, internalData} from './Internal.ts'
import {sql, type Sql} from './Sql.ts'
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
  mapFromDriverValue?(value: unknown, specs: DriverSpecs): unknown
  mapToDriverValue?(value: unknown): unknown
}

type WithoutNull<Value> = Exclude<Value, null>

export class Column<Value = unknown> {
  readonly [internalData]: ColumnData
  constructor(data: ColumnData) {
    this[internalData] = data
  }
  notNull(): RequiredColumn<WithoutNull<Value>> {
    return new Column({
      ...getData(this),
      notNull: true
    }) as RequiredColumn
  }
  default(
    value: Input<WithoutNull<Value>> | (() => Input<WithoutNull<Value>>)
  ): Column<WithoutNull<Value>> {
    return new Column({
      ...getData(this),
      defaultValue(): HasSql {
        return input(value instanceof Function ? value() : value)
      }
    })
  }
  primaryKey(): Column<WithoutNull<Value>> {
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

function createColumn(data: ColumnData): Column {
  return new Column(data)
}

export interface Columns {
  <T>(data: ColumnData): Column<T>
  [key: string]: (...args: Array<Input<any>>) => Sql<any>
}

export const column: Columns = new Proxy(createColumn as any, {
  get(target: Record<string, Function>, method: string) {
    return (target[method] ??= (...args: Array<Input<unknown>>) => {
      while (args.length > 1) if (args.at(-1) === undefined) args.pop()
      if (args.length === 0) return sql.unsafe(method)
      return sql`${sql.unsafe(method)}(${sql.join(
        args.map(sql.inline),
        sql`, `
      )})`
    })
  }
})
