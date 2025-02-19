import type {DriverSpecs} from './Driver.ts'
import {getData, getField, internalData} from './Internal.ts'
import {type Sql, sql} from './Sql.ts'
import type {Field, FieldData} from './expr/Field.ts'
import {callFunction} from './expr/Functions.ts'
import {type Input, input} from './expr/Input.ts'

export interface ColumnData {
  type: Sql
  name?: string
  json?: boolean
  primary?: boolean
  notNull?: boolean
  isUnique?: boolean
  autoIncrement?: boolean
  $default?(): Sql
  defaultValue?: Sql
  references?(): FieldData
  onUpdate?: Sql
  onDelete?: Sql
  mapFromDriverValue?(value: unknown, specs: DriverSpecs): unknown
  mapToDriverValue?(value: unknown): unknown
}

type WithoutNull<Value> = Exclude<Value, null>

export class Column<Value = unknown> {
  readonly [internalData]: ColumnData
  constructor(data: ColumnData) {
    this[internalData] = data
  }
  notNull(): RequiredColumn<Value> {
    return <any>new Column({
      ...getData(this),
      notNull: true
    })
  }
  $defaultFn(
    value: () => Input<WithoutNull<Value>>
  ): Column<WithoutNull<Value>> {
    return this.$default(value)
  }
  $default(
    value: Input<WithoutNull<Value>> | (() => Input<WithoutNull<Value>>)
  ): Column<WithoutNull<Value>> {
    return new Column({
      ...getData(this),
      $default(): Sql {
        return input(value instanceof Function ? value() : value)
      }
    })
  }
  default(value: Input<WithoutNull<Value>>): Column<WithoutNull<Value>> {
    return new Column({
      ...getData(this),
      defaultValue: input(value).inlineValues()
    })
  }
  defaultNow(): Column<WithoutNull<Value>> {
    return new Column({
      ...getData(this),
      defaultValue: sql.unsafe('now()')
    })
  }
  primaryKey(options?: {autoIncrement: boolean}): Column<WithoutNull<Value>> {
    return new Column({...getData(this), ...options, primary: true})
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
  $type<T>(): Column<null extends Value ? T | null : T> {
    return this as any
  }
}

export class JsonColumn<Value = unknown> extends Column<Value> {
  private declare brand: [Value]
  constructor(data: ColumnData) {
    super({...data, json: true})
  }
}

declare const required: unique symbol
export interface RequiredColumn<Value = unknown>
  extends Column<WithoutNull<Value>> {
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
      while (args.length > 0)
        if (args.at(-1) === undefined) args.pop()
        else break
      if (args.length === 0) return sql.unsafe(method)
      return sql`${sql.unsafe(method)}(${sql.join(
        args.map(sql.inline),
        sql`, `
      )})`
    })
  }
})

function formatReferences(fields: Array<FieldData>): Sql {
  return callFunction(
    sql.identifier(fields[0].targetName),
    fields.map(field => sql.identifier(field.fieldName))
  )
}

export function formatColumn(column: ColumnData): Sql {
  const references =
    column.references &&
    sql`references ${formatReferences([column.references!()])}`
  return sql.join([
    column.type,
    column.primary && sql`primary key`,
    column.notNull && sql`not null`,
    column.isUnique && sql`unique`,
    column.autoIncrement && sql`autoincrement`,
    column.defaultValue && sql`default ${column.defaultValue}`,
    references,
    column.onUpdate && sql`on update ${column.onUpdate}`
  ])
}
