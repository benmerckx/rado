import {
  Column,
  type ColumnArguments,
  ColumnType,
  column,
  columnConfig
} from '../core/Column.ts'
import {internalData} from '../core/Internal.ts'
import {sql} from '../core/Sql.ts'

type Precision = 0 | 1 | 2 | 3 | 4 | 5 | 6
type IntervalFields =
  | 'year'
  | 'month'
  | 'day'
  | 'hour'
  | 'minute'
  | 'second'
  | 'year to month'
  | 'day to hour'
  | 'day to minute'
  | 'day to second'
  | 'hour to minute'
  | 'hour to second'
  | 'minute to second'

type PointTuple = [number, number]
type PointXY = {x: number; y: number}
type LineTuple = [number, number, number]
type LineABC = {a: number; b: number; c: number}
type IntegerMode = 'number' | 'bigint'
type NumericMode = 'number' | 'bigint'

function parsePoint(value: string): PointTuple {
  const cleaned = value.trim().replace(/^\(/, '').replace(/\)$/, '')
  const [x, y] = cleaned.split(',').map(v => Number.parseFloat(v))
  return [x, y]
}

function formatPoint(value: PointTuple | PointXY | string): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return `(${value[0]},${value[1]})`
  return `(${value.x},${value.y})`
}

function parseLine(value: string): LineTuple {
  const cleaned = value
    .trim()
    .replace(/^[({[]/, '')
    .replace(/[)}\]]$/, '')
  const [a, b, c] = cleaned.split(',').map(v => Number.parseFloat(v))
  return [a, b, c]
}

function formatLine(value: LineTuple | LineABC | string): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return `{${value[0]},${value[1]},${value[2]}}`
  return `{${value.a},${value.b},${value.c}}`
}

export class PgColumn<Value = unknown> extends Column<Value> {
  array(size?: number): PgArrayColumn<Value> {
    throw new PgArrayColumn({
      ...this[internalData],
      type: new ColumnType(
        'array',
        [this[internalData].type],
        sql`${this[internalData].type}[${size ?? ''}]`
      )
    })
  }
}

export class PgArrayColumn<T> extends PgColumn<Array<T>> {}

export function bigint(
  ...args: ColumnArguments<{mode: 'number'}>
): PgColumn<number | null>
export function bigint(
  ...args: ColumnArguments<{mode?: 'bigint'}>
): PgColumn<bigint | null>
export function bigint(...args: ColumnArguments<{mode?: IntegerMode}>) {
  const {name, options} = columnConfig(args)
  return new PgColumn({
    name,
    type: column.bigint(),
    mapFromDriverValue: options?.mode === 'number' ? Number : BigInt
  })
}

export function bigserial(
  ...args: ColumnArguments<{mode: 'number'}>
): PgColumn<number | null>
export function bigserial(
  ...args: ColumnArguments<{mode?: 'bigint'}>
): PgColumn<bigint | null>
export function bigserial(...args: ColumnArguments<{mode?: IntegerMode}>) {
  const {name, options} = columnConfig(args)
  return new PgColumn({
    name,
    type: column.bigserial(),
    mapFromDriverValue: options?.mode === 'number' ? Number : BigInt
  })
}

export function char(
  name?: string,
  options?: {length: number}
): PgColumn<string | null> {
  return new PgColumn({
    name,
    type: column.character(options?.length ?? 1)
  })
}

export function bit(
  ...args: ColumnArguments<{dimensions?: number}>
): PgColumn<string | null> {
  const {name, options} = columnConfig(args)
  return new PgColumn({name, type: column.bit(options?.dimensions)})
}

export function varbit(
  ...args: ColumnArguments<{dimensions?: number}>
): PgColumn<string | null> {
  const {name, options} = columnConfig(args)
  return new PgColumn({name, type: column.varbit(options?.dimensions)})
}

export function cidr(name?: string): PgColumn<string | null> {
  return new PgColumn({name, type: column.cidr()})
}

export function date(
  name?: string,
  options?: {mode: 'string'}
): PgColumn<string | null>
export function date(
  name: string | undefined,
  options: {mode: 'date'}
): PgColumn<Date | null>
export function date(name?: string, options?: {mode: 'date' | 'string'}) {
  return new PgColumn({
    name,
    type: column.date(),
    mapFromDriverValue(value: string) {
      return options?.mode === 'date' ? Date.parse(value) : value
    },
    mapToDriverValue(value: Date) {
      return value instanceof Date ? value.toISOString() : value
    }
  })
}

export function doublePrecision(name?: string): PgColumn<number | null> {
  return new PgColumn({
    name,
    type: column['double precision'](),
    mapFromDriverValue(value: string | number): number {
      return typeof value === 'string' ? Number.parseFloat(value) : value
    }
  })
}

export function inet(name?: string): PgColumn<string | null> {
  return new PgColumn({name, type: column.inet()})
}

export function integer(name?: string): PgColumn<number | null> {
  return new PgColumn({name, type: column.integer()})
}

export const int = integer

export function oid(name?: string): PgColumn<number | null> {
  return new PgColumn({name, type: column.oid()})
}

export function point(
  ...args: ColumnArguments<{mode?: 'tuple'}>
): PgColumn<PointTuple | null>
export function point(
  ...args: ColumnArguments<{mode: 'xy'}>
): PgColumn<PointXY | null>
export function point(
  ...args: ColumnArguments<{mode?: 'tuple' | 'xy'}>
): PgColumn<PointTuple | PointXY | null> {
  const {name, options} = columnConfig(args)
  const mode = options?.mode ?? 'tuple'
  return new PgColumn({
    name,
    type: column.point(),
    mapFromDriverValue(value: string) {
      const [x, y] = parsePoint(value)
      return mode === 'xy' ? {x, y} : [x, y]
    },
    mapToDriverValue(value: PointTuple | PointXY | string) {
      return formatPoint(value)
    }
  })
}

export function line(
  ...args: ColumnArguments<{mode?: 'tuple'}>
): PgColumn<LineTuple | null>
export function line(
  ...args: ColumnArguments<{mode: 'abc'}>
): PgColumn<LineABC | null>
export function line(
  ...args: ColumnArguments<{mode?: 'tuple' | 'abc'}>
): PgColumn<LineTuple | LineABC | null> {
  const {name, options} = columnConfig(args)
  const mode = options?.mode ?? 'tuple'
  return new PgColumn({
    name,
    type: column.line(),
    mapFromDriverValue(value: string) {
      const [a, b, c] = parseLine(value)
      return mode === 'abc' ? {a, b, c} : [a, b, c]
    },
    mapToDriverValue(value: LineTuple | LineABC | string) {
      return formatLine(value)
    }
  })
}

export function interval(
  ...args: ColumnArguments<{fields?: IntervalFields; precision?: Precision}>
): PgColumn<string | null> {
  const {name, options} = columnConfig(args)
  return new PgColumn({
    name,
    type: column[options?.fields ? `interval ${options.fields}` : 'interval'](
      options?.precision
    )
  })
}

export function serial(name?: string): PgColumn<number> {
  return new PgColumn({name, type: column.serial()})
}

export function boolean(name?: string): PgColumn<boolean | null> {
  return new PgColumn({name, type: column.boolean()})
}

export function bytea(name?: string): PgColumn<Uint8Array | null> {
  return new PgColumn({name, type: column.bytea()})
}

export function text(name?: string): PgColumn<string | null> {
  return new PgColumn({name, type: column.text()})
}

export function json<T>(name?: string): PgColumn<T | null> {
  return new PgColumn({
    name,
    type: column.json(),
    mapToDriverValue(value: T): string {
      return JSON.stringify(value)
    },
    mapFromDriverValue(value: unknown, {parsesJson}) {
      return parsesJson ? value : JSON.parse(value as string)
    },
    json: true
  })
}

export function jsonb<T>(name?: string): PgColumn<T | null> {
  return new PgColumn({
    name,
    type: column.jsonb(),
    mapToDriverValue(value: T): string {
      return JSON.stringify(value)
    },
    mapFromDriverValue(value: unknown, {parsesJson}) {
      return parsesJson ? value : JSON.parse(value as string)
    },
    json: true
  })
}

export function geometry(
  ...args: ColumnArguments<{type?: string; mode?: 'tuple' | 'xy'}>
): PgColumn<PointTuple | PointXY | string | null> {
  const {name, options} = columnConfig(args)
  const typeArg = options?.type ? sql.unsafe(options.type) : undefined
  const geometryType = options?.type
    ? new ColumnType('geometry', [], sql`geometry(${typeArg})`)
    : column.geometry()
  const mode = options?.mode ?? 'tuple'
  return new PgColumn({
    name,
    type: geometryType,
    mapFromDriverValue(value: string) {
      if (options?.type !== 'point') return value
      const [x, y] = parsePoint(value)
      return mode === 'xy' ? {x, y} : [x, y]
    },
    mapToDriverValue(value: PointTuple | PointXY | string) {
      if (options?.type !== 'point') return value
      return formatPoint(value)
    }
  })
}

export function vector(
  ...args: ColumnArguments<{dimensions: number}>
): PgColumn<string | null> {
  const {name, options} = columnConfig(args)
  return new PgColumn({name, type: column.vector(options?.dimensions)})
}

export function halfvec(
  ...args: ColumnArguments<{dimensions: number}>
): PgColumn<string | null> {
  const {name, options} = columnConfig(args)
  return new PgColumn({name, type: column.halfvec(options?.dimensions)})
}

export function sparsevec(
  ...args: ColumnArguments<{dimensions: number}>
): PgColumn<string | null> {
  const {name, options} = columnConfig(args)
  return new PgColumn({name, type: column.sparsevec(options?.dimensions)})
}

export function macaddr(name?: string): PgColumn<string | null> {
  return new PgColumn({name, type: column.macaddr()})
}

export function macaddr8(name?: string): PgColumn<string | null> {
  return new PgColumn({name, type: column.macaddr8()})
}

export function numeric(
  ...args: ColumnArguments<{precision?: number; scale?: number}>
): PgColumn<number | null>
export function numeric(
  ...args: ColumnArguments<{
    precision?: number
    scale?: number
    mode: 'number'
  }>
): PgColumn<number | null>
export function numeric(
  ...args: ColumnArguments<{
    precision?: number
    scale?: number
    mode: 'bigint'
  }>
): PgColumn<bigint | null>
export function numeric(
  ...args: ColumnArguments<{
    precision?: number
    scale?: number
    mode?: NumericMode
  }>
): PgColumn<number | bigint | null> {
  const {name, options} = columnConfig(args)
  const mode = options?.mode ?? 'number'
  return new PgColumn({
    name,
    type: column.numeric(options?.precision, options?.scale),
    mapFromDriverValue: mode === 'bigint' ? BigInt : Number
  })
}

export function real(name?: string): PgColumn<number | null> {
  return new PgColumn({
    name,
    type: column.real(),
    mapFromDriverValue(value: string | number): number {
      return typeof value === 'string' ? Number.parseFloat(value) : value
    }
  })
}

export function smallint(name?: string): PgColumn<number | null> {
  return new PgColumn({name, type: column.smallint()})
}

export function smallserial(name?: string): PgColumn<number | null> {
  return new PgColumn({name, type: column.smallserial()})
}

export function time(
  ...args: ColumnArguments<{precision?: Precision; withTimeZone?: boolean}>
): PgColumn<string | null> {
  const {name, options} = columnConfig(args)
  return new PgColumn({
    name,
    type: column[options?.withTimeZone ? 'time with time zone' : 'time'](
      options?.precision
    )
  })
}

export function timestamp(
  ...args: ColumnArguments<{
    mode?: 'date'
    precision?: Precision
    withTimeZone?: boolean
    withTimezone?: boolean
  }>
): PgColumn<Date | null>
export function timestamp(
  ...args: ColumnArguments<{
    mode: 'string'
    precision?: Precision
    withTimeZone?: boolean
    withTimezone?: boolean
  }>
): PgColumn<string | null>
export function timestamp(
  ...args: ColumnArguments<{
    mode?: 'string' | 'date'
    precision?: Precision
    withTimeZone?: boolean
    withTimezone?: boolean
  }>
) {
  const {name, options} = columnConfig(args)
  const withTimeZone = options?.withTimeZone ?? options?.withTimezone
  return new PgColumn({
    name,
    type: column[withTimeZone ? 'timestamp with time zone' : 'timestamp'](
      options?.precision
    ),
    mapFromDriverValue(value: string) {
      return options?.mode === 'string' ? value : Date.parse(value)
    },
    mapToDriverValue(value: Date) {
      return value instanceof Date ? value.toISOString() : value
    }
  })
}

export function uuid(name?: string): PgColumn<string | null> {
  return new PgColumn<string | null>({name, type: column.uuid()})
}

export function varchar(
  ...args: ColumnArguments<{length: number}>
): PgColumn<string | null> {
  const {name, options} = columnConfig(args)
  return new PgColumn({
    name,
    type: column.varchar(options?.length)
  })
}
