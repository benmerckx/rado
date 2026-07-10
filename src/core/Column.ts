import type {DriverSpecs} from './Driver.ts'
import type {Field, FieldData} from './expr/Field.ts'
import {callFunction} from './expr/Functions.ts'
import {type Input, input, mapToColumn} from './expr/Input.ts'
import {
  type HasSql,
  getData,
  getField,
  internalData,
  internalEnum,
  internalSql
} from './Internal.ts'
import {type Sql, sql} from './Sql.ts'

export type ReferenceAction =
  | 'cascade'
  | 'restrict'
  | 'no action'
  | 'set null'
  | 'set default'

export interface ReferenceOptions {
  onDelete?: ReferenceAction
  onUpdate?: ReferenceAction
}

export interface BaseColumnData {
  type: HasSql
  name?: string
  json?: boolean
  primary?: boolean
  notNull?: boolean
  isUnique?: boolean
  nullsNotDistinct?: boolean
  autoIncrement?: boolean
  defaultValue?: Sql
  references?(): FieldData
  referenceOptions?: ReferenceOptions
  mapFromDriverValue?(value: unknown, specs: DriverSpecs): unknown
  mapToDriverValue?(value: unknown): unknown
  $default?(): Sql
  $onUpdate?(): Sql
  readonly [internalEnum]?: unknown
}

export interface ColumnData extends BaseColumnData {
  type: ColumnType
}

function formatType(kind: string, args: Array<Input<unknown>>): Sql {
  return args.length === 0
    ? sql.unsafe(kind)
    : sql`${sql.unsafe(kind)}(${sql.join(args.map(sql.inline), sql`, `)})`
}

export class ColumnType implements HasSql {
  [internalSql]: Sql
  constructor(
    public kind: string,
    public args: Array<Input<unknown>>,
    sql: Sql = formatType(kind, args)
  ) {
    this[internalSql] = sql
  }
}

export type Nullability = [allowsNull: boolean, isRequired: boolean]

type WithoutNull<Value> = Exclude<Value, null>

export class Column<Value = unknown, Nulls extends Nullability = Nullability> {
  readonly [internalData]: ColumnData
  constructor(data: ColumnData) {
    this[internalData] = data
  }
  notNull(): Column<Value, [false, Nulls[1]]> {
    return new Column({
      ...getData(this),
      notNull: true
    })
  }
  $defaultFn(value: () => Input<Value>): Column<Value, [Nulls[0], false]> {
    return this.$default(value)
  }
  $default(
    value: Input<Value> | (() => Input<Value>)
  ): Column<Value, [Nulls[0], false]> {
    return new Column({
      ...getData(this),
      $default: () =>
        mapToColumn(
          getData(this),
          typeof value === 'function' ? (value as Function)() : value
        )
    })
  }
  $onUpdateFn(fn: () => Input<Value>): Column<Value, Nulls> {
    return this.$onUpdate(fn)
  }
  $onUpdate(fn: () => Input<Value>): Column<Value, Nulls> {
    return new Column({
      ...getData(this),
      $onUpdate: () => mapToColumn(getData(this), fn())
    })
  }
  default(value: Input<Value>): Column<Value, [Nulls[0], false]> {
    return new Column({
      ...getData(this),
      defaultValue: input(value)
    })
  }
  defaultNow(): Column<WithoutNull<Value>, [Nulls[0], false]> {
    return new Column({
      ...getData(this),
      defaultValue: sql.unsafe('now()')
    })
  }
  primaryKey(options?: {
    autoIncrement: boolean
  }): Column<Value, [false, false]> {
    return new Column({...getData(this), ...options, primary: true})
  }
  autoincrement(): Column<Value, Nulls> {
    return new Column({...getData(this), autoIncrement: true})
  }
  unique(name?: string): Column<Value, Nulls> {
    return new Column({...getData(this), isUnique: true})
  }
  references(
    foreignField: Field | (() => Field),
    options?: ReferenceOptions
  ): Column<Value, Nulls> {
    return new Column<Value, Nulls>({
      ...getData(this),
      references() {
        return getField(
          typeof foreignField === 'function' ? foreignField() : foreignField
        )
      },
      referenceOptions: options
    })
  }
  $type<T>(): Column<T, Nulls> {
    return this as any
  }
}

export class JsonColumn<
  Value,
  Meta extends Nullability = Nullability
> extends Column<Value, Meta> {
  declare private brand: [Value]
  constructor(data: ColumnData) {
    super({...data, json: true})
  }
}

export interface Columns {
  [key: string]: (...args: Array<Input<any>>) => ColumnType
}

export const column: Columns = new Proxy<Columns>(
  {},
  {
    get(target: Record<string, Function>, method: string) {
      return (target[method] ??= (...args: Array<Input<unknown>>) => {
        while (args.length > 0)
          if (args.at(-1) === undefined) args.pop()
          else break
        return new ColumnType(method, args)
      })
    }
  }
)

export type ColumnArguments<Options> =
  | [name?: string]
  | [options: Options]
  | [name: string | undefined, options: Options]

export function columnConfig<Options>(args: ColumnArguments<Options>): {
  name: string | undefined
  options: Options | undefined
} {
  if (args.length > 1)
    return {name: args[0] as string | undefined, options: args[1] as Options}
  if (typeof args[0] === 'string')
    return {name: args[0] as string, options: args[1]}
  return {name: undefined, options: args[0] as Options}
}

function formatReferences(
  fields: Array<FieldData>,
  options: ReferenceOptions = {}
): Sql {
  return sql.query(
    callFunction(
      sql.identifier(fields[0].targetName),
      fields.map(field => sql.identifier(field.fieldName))
    ),
    {
      onDelete: options.onDelete && sql.unsafe(options.onDelete),
      onUpdate: options.onUpdate && sql.unsafe(options.onUpdate)
    }
  )
}
export function formatColumn(column: BaseColumnData): Sql {
  return sql.query(
    column.type,
    {
      primaryKey: column.primary,
      notNull: column.notNull,
      unique: column.isUnique,
      nullsNotDistinct: column.nullsNotDistinct
    },
    column.autoIncrement
      ? sql.universal({mysql: sql`auto_increment`, default: sql`autoincrement`})
      : undefined,
    column.defaultValue !== undefined
      ? sql`default (${column.defaultValue})`.inlineValues()
      : undefined,
    {
      references:
        column.references &&
        formatReferences([column.references!()], column.referenceOptions)
    }
  )
}
