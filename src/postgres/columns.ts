import {
  type Column,
  type ColumnArguments,
  ColumnType,
  JsonColumn,
  column,
  columnConfig
} from '../core/Column.ts'
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
  const cleaned = value.trim().replace(/^[({[]/, '').replace(/[)}\]]$/, '')
  const [a, b, c] = cleaned.split(',').map(v => Number.parseFloat(v))
  return [a, b, c]
}

function formatLine(value: LineTuple | LineABC | string): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return `{${value[0]},${value[1]},${value[2]}}`
  return `{${value.a},${value.b},${value.c}}`
}

export function bigint(
  name: string | undefined,
  options: {mode: 'number'}
): Column<number | null>
export function bigint(name?: string): Column<bigint | null>
export function bigint(name?: string, options?: {mode: 'number'}) {
  return column({
    name,
    type: column.bigint(),
    mapFromDriverValue: options?.mode === 'number' ? Number : BigInt
  })
}

export function bigserial(
  name: string | undefined,
  options: {mode: 'number'}
): Column<number | null>
export function bigserial(name?: string): Column<bigint | null>
export function bigserial(name?: string, options?: {mode: 'number'}) {
  return column({
    name,
    type: column.bigserial(),
    mapFromDriverValue: options?.mode === 'number' ? Number : BigInt
  })
}

export function char(
  name?: string,
  options?: {length: number}
): Column<string | null> {
  return column({
    name,
    type: column.character(options?.length ?? 1)
  })
}

export function bit(
  ...args: ColumnArguments<{dimensions?: number}>
): Column<string | null> {
  const {name, options} = columnConfig(args)
  return column({name, type: column.bit(options?.dimensions)})
}

export function varbit(
  ...args: ColumnArguments<{dimensions?: number}>
): Column<string | null> {
  const {name, options} = columnConfig(args)
  return column({name, type: column.varbit(options?.dimensions)})
}

export function cidr(name?: string): Column<string | null> {
  return column({name, type: column.cidr()})
}

export function date(
  name?: string,
  options?: {mode: 'string'}
): Column<string | null>
export function date(
  name: string | undefined,
  options: {mode: 'date'}
): Column<Date | null>
export function date(name?: string, options?: {mode: 'date' | 'string'}) {
  return column({
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

export function doublePrecision(name?: string): Column<number | null> {
  return column({
    name,
    type: column['double precision'](),
    mapFromDriverValue(value: string | number): number {
      return typeof value === 'string' ? Number.parseFloat(value) : value
    }
  })
}

export function inet(name?: string): Column<string | null> {
  return column({name, type: column.inet()})
}

export function integer(name?: string): Column<number | null> {
  return column({name, type: column.integer()})
}

export const int = integer

export function oid(name?: string): Column<number | null> {
  return column({name, type: column.oid()})
}

export function point(
  ...args: ColumnArguments<{mode?: 'tuple'}>
): Column<PointTuple | null>
export function point(
  ...args: ColumnArguments<{mode: 'xy'}>
): Column<PointXY | null>
export function point(
  ...args: ColumnArguments<{mode?: 'tuple' | 'xy'}>
): Column<PointTuple | PointXY | null> {
  const {name, options} = columnConfig(args)
  const mode = options?.mode ?? 'tuple'
  return column({
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
): Column<LineTuple | null>
export function line(
  ...args: ColumnArguments<{mode: 'abc'}>
): Column<LineABC | null>
export function line(
  ...args: ColumnArguments<{mode?: 'tuple' | 'abc'}>
): Column<LineTuple | LineABC | null> {
  const {name, options} = columnConfig(args)
  const mode = options?.mode ?? 'tuple'
  return column({
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
): Column<string | null> {
  const {name, options} = columnConfig(args)
  return column({
    name,
    type: column[options?.fields ? `interval ${options.fields}` : 'interval'](
      options?.precision
    )
  })
}

export function serial(name?: string): Column<number> {
  return column({name, type: column.serial()})
}

export function boolean(name?: string): Column<boolean | null> {
  return column({name, type: column.boolean()})
}

export function bytea(name?: string): Column<Uint8Array | null> {
  return column({name, type: column.bytea()})
}

export function text(name?: string): Column<string | null> {
  return column({name, type: column.text()})
}

export function json<T>(name?: string): JsonColumn<T | null> {
  return new JsonColumn({
    name,
    type: column.json(),
    mapToDriverValue(value: T): string {
      return JSON.stringify(value)
    },
    mapFromDriverValue(value: unknown, {parsesJson}) {
      return parsesJson ? value : JSON.parse(value as string)
    }
  })
}

export function jsonb<T>(name?: string): JsonColumn<T | null> {
  return new JsonColumn({
    name,
    type: column.jsonb(),
    mapToDriverValue(value: T): string {
      return JSON.stringify(value)
    },
    mapFromDriverValue(value: unknown, {parsesJson}) {
      return parsesJson ? value : JSON.parse(value as string)
    }
  })
}

export function geometry(
  ...args: ColumnArguments<{type?: string; mode?: 'tuple' | 'xy'}>
): Column<PointTuple | PointXY | string | null> {
  const {name, options} = columnConfig(args)
  const typeArg = options?.type ? sql.unsafe(options.type) : undefined
  const geometryType = options?.type
    ? new ColumnType('geometry', [], sql`geometry(${typeArg})`)
    : column.geometry()
  const mode = options?.mode ?? 'tuple'
  return column({
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
): Column<string | null> {
  const {name, options} = columnConfig(args)
  return column({name, type: column.vector(options?.dimensions)})
}

export function halfvec(
  ...args: ColumnArguments<{dimensions: number}>
): Column<string | null> {
  const {name, options} = columnConfig(args)
  return column({name, type: column.halfvec(options?.dimensions)})
}

export function sparsevec(
  ...args: ColumnArguments<{dimensions: number}>
): Column<string | null> {
  const {name, options} = columnConfig(args)
  return column({name, type: column.sparsevec(options?.dimensions)})
}

export function macaddr(name?: string): Column<string | null> {
  return column({name, type: column.macaddr()})
}

export function macaddr8(name?: string): Column<string | null> {
  return column({name, type: column.macaddr8()})
}

export function numeric(
  ...args: ColumnArguments<{precision?: number; scale?: number}>
): Column<number | null> {
  const {name, options} = columnConfig(args)
  return column({
    name,
    type: column.numeric(options?.precision, options?.scale)
  })
}

export function real(name?: string): Column<number | null> {
  return column({
    name,
    type: column.real(),
    mapFromDriverValue(value: string | number): number {
      return typeof value === 'string' ? Number.parseFloat(value) : value
    }
  })
}

export function smallint(name?: string): Column<number | null> {
  return column({name, type: column.smallint()})
}

export function smallserial(name?: string): Column<number | null> {
  return column({name, type: column.smallserial()})
}

export function time(
  ...args: ColumnArguments<{precision?: Precision; withTimeZone?: boolean}>
): Column<string | null> {
  const {name, options} = columnConfig(args)
  return column({
    name,
    type: column[options?.withTimeZone ? 'time with time zone' : 'time'](
      options?.precision
    )
  })
}

export function timestamp(
  ...args: ColumnArguments<{precision?: Precision; withTimeZone?: boolean}>
): Column<Date | null>
export function timestamp(
  ...args: ColumnArguments<{
    mode: 'string'
    precision?: Precision
    withTimeZone?: boolean
  }>
): Column<string | null>
export function timestamp(
  ...args: ColumnArguments<{
    mode?: 'string'
    precision?: Precision
    withTimeZone?: boolean
  }>
) {
  const {name, options} = columnConfig(args)
  return column({
    name,
    type: column[
      options?.withTimeZone ? 'timestamp with time zone' : 'timestamp'
    ](options?.precision),
    mapFromDriverValue(value: string) {
      return options?.mode === 'string' ? value : Date.parse(value)
    },
    mapToDriverValue(value: Date) {
      return value instanceof Date ? value.toISOString() : value
    }
  })
}

export function uuid(name?: string): Column<string | null> {
  return column<string | null>({name, type: column.uuid()})
}

export function varchar(
  ...args: ColumnArguments<{length: number}>
): Column<string | null> {
  const {name, options} = columnConfig(args)
  return column({
    name,
    type: column.varchar(options?.length)
  })
}
