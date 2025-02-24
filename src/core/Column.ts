import type {DriverSpecs} from './Driver.ts'
import {getData, getField, internalData} from './Internal.ts'
import {type Sql, sql} from './Sql.ts'
import type {Field, FieldData} from './expr/Field.ts'
import {callFunction} from './expr/Functions.ts'
import {type Input, input, mapToColumn} from './expr/Input.ts'

export interface ColumnData {
  type: Sql
  name?: string
  json?: boolean
  primary?: boolean
  notNull?: boolean
  isUnique?: boolean
  autoIncrement?: boolean
  defaultValue?: Sql
  references?(): FieldData
  mapFromDriverValue?(value: unknown, specs: DriverSpecs): unknown
  mapToDriverValue?(value: unknown): unknown
  $default?(): Sql
  $onUpdate?(): Sql
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
      $default: () =>
        mapToColumn(getData(this), value instanceof Function ? value() : value)
    })
  }
  $onUpdateFn(fn: () => Input<Value>): Column<Value> {
    return this.$onUpdate(fn)
  }
  $onUpdate(fn: () => Input<Value>): Column<Value> {
    return new Column({
      ...getData(this),
      $onUpdate: () => mapToColumn(getData(this), fn())
    })
  }
  default(value: Input<WithoutNull<Value>>): Column<WithoutNull<Value>> {
    return new Column({
      ...getData(this),
      defaultValue: input(value)
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

export type ColumnArguments<Options> =
  | [name?: string]
  | [options: Options]
  | [name: string, options: Options]

export function columnConfig<Options>(args: ColumnArguments<Options>) {
  if (typeof args[0] === 'string')
    return {name: args[0] as string, options: args[1]}
  return {name: undefined, options: args[0] as Options}
}

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
  return sql.query(
    column.type,
    {
      primaryKey: column.primary,
      notNull: column.notNull,
      unique: column.isUnique,
      autoincrement: column.autoIncrement
    },
    column.defaultValue !== undefined
      ? sql`default (${column.defaultValue})`.inlineValues()
      : undefined,
    references
  )
}
