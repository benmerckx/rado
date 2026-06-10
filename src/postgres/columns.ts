import {
  Column,
  type ColumnArguments,
  ColumnType,
  type Nullability,
  column,
  columnConfig
} from '../core/Column.ts'
import {getData} from '../core/Internal.ts'
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
type GeometryBaseType =
  | 'geometry'
  | 'point'
  | 'line'
  | 'linestring'
  | 'polygon'
  | 'multipoint'
  | 'multilinestring'
  | 'multipolygon'
  | 'geometrycollection'
  | 'circularstring'
  | 'compoundcurve'
  | 'curvepolygon'
  | 'multicurve'
  | 'multisurface'
  | 'polyhedralsurface'
  | 'triangle'
  | 'tin'
type GeometryType = `${GeometryBaseType}${'' | 'z' | 'm' | 'zm'}`

const GEOMETRY_TYPE =
  /^(geometry|point|line|linestring|polygon|multipoint|multilinestring|multipolygon|geometrycollection|circularstring|compoundcurve|curvepolygon|multicurve|multisurface|polyhedralsurface|triangle|tin)(z|m|zm)?$/

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

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

function pad3(value: number): string {
  return String(value).padStart(3, '0')
}

function formatDateString(value: Date): string {
  return `${value.getUTCFullYear()}-${pad2(value.getUTCMonth() + 1)}-${pad2(
    value.getUTCDate()
  )}`
}

function formatTimestampString(value: Date, withTimeZone: boolean): string {
  const date = formatDateString(value)
  const time = `${pad2(value.getUTCHours())}:${pad2(
    value.getUTCMinutes()
  )}:${pad2(value.getUTCSeconds())}.${pad3(value.getUTCMilliseconds())}`
  return withTimeZone ? `${date} ${time}+00` : `${date} ${time}`
}

function parsePgArrayValue(input: string): Array<unknown> {
  if (!input.startsWith('{') || !input.endsWith('}')) return [input]
  const source = input.slice(1, -1)
  const parts: Array<string> = []
  let token = ''
  let depth = 0
  let inQuotes = false
  let wasQuoted = false

  const pushToken = () => {
    if (!wasQuoted && token === 'NULL') parts.push('\0NULL')
    else parts.push(token)
    token = ''
    wasQuoted = false
  }

  for (let i = 0; i < source.length; i++) {
    const char = source[i]!
    if (inQuotes) {
      if (char === '\\') {
        const next = source[++i]
        if (next !== undefined) token += next
        continue
      }
      if (char === '"') {
        inQuotes = false
        wasQuoted = true
        continue
      }
      token += char
      continue
    }
    if (char === '"') {
      inQuotes = true
      continue
    }
    if (char === '{') {
      depth++
      token += char
      continue
    }
    if (char === '}') {
      depth--
      token += char
      continue
    }
    if (char === ',' && depth === 0) {
      pushToken()
      continue
    }
    token += char
  }
  pushToken()

  return parts.map(part => {
    if (part === '\0NULL') return null
    if (part.startsWith('{') && part.endsWith('}'))
      return parsePgArrayValue(part)
    return part
  })
}

function serializePgArrayValue(value: Array<unknown>): string {
  return `{${value.map(serializePgArrayItem).join(',')}}`
}

function serializePgArrayItem(value: unknown): string {
  if (Array.isArray(value)) return serializePgArrayValue(value)
  if (value === null || value === undefined) return 'NULL'
  let normalized: string
  if (value instanceof Date) normalized = value.toISOString()
  else if (typeof value === 'string') normalized = value
  else if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  )
    normalized = String(value)
  else normalized = JSON.stringify(value)
  const escaped = normalized.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  return `"${escaped}"`
}

function mapArrayItems(
  value: unknown,
  mapper: (item: unknown) => unknown
): unknown {
  if (!Array.isArray(value)) return value
  return value.map(item => mapper(item))
}

export class PgColumn<
  Value = unknown,
  Nulls extends Nullability = Nullability
> extends Column<Value, Nulls> {
  notNull(): PgColumn<Value, [false, Nulls[1]]> {
    return new PgColumn({
      ...getData(this),
      notNull: true
    })
  }
  unique(
    name?: string,
    config?: {nulls: 'distinct' | 'not distinct'}
  ): PgColumn<Value, Nulls> {
    return new PgColumn({
      ...getData(this),
      isUnique: true,
      nullsNotDistinct: config?.nulls === 'not distinct',
      name
    })
  }

  array(size?: number): PgColumn<Array<Value>, Nulls> {
    const data = getData(this)
    const mapTo = data.mapToDriverValue
    const mapFrom = data.mapFromDriverValue
    return new PgColumn({
      ...data,
      type: new ColumnType('array', [data.type], sql`${data.type}[${size}]`),
      mapToDriverValue(value: unknown) {
        if (!Array.isArray(value)) return value
        const mapped = mapArrayItems(value, item =>
          item !== null && item !== undefined && mapTo ? mapTo(item) : item
        )
        return serializePgArrayValue(mapped as Array<unknown>)
      },
      mapFromDriverValue(value: unknown, specs) {
        const parsed =
          typeof value === 'string' ? parsePgArrayValue(value) : value
        if (!Array.isArray(parsed)) return parsed
        return mapArrayItems(parsed, item =>
          item !== null && item !== undefined && mapFrom
            ? mapFrom(item, specs)
            : item
        )
      }
    })
  }

  generatedAlwaysAsIdentity(): PgColumn<Value, Nulls> {
    const data = getData(this)
    return new PgColumn({
      ...data,
      type: new ColumnType(
        data.type.kind,
        data.type.args,
        sql`${data.type} generated always as identity`
      )
    })
  }

  generatedByDefaultAsIdentity(): PgColumn<Value, Nulls> {
    const data = getData(this)
    return new PgColumn({
      ...data,
      type: new ColumnType(
        data.type.kind,
        data.type.args,
        sql`${data.type} generated by default as identity`
      )
    })
  }
}

export function bigint(
  ...args: ColumnArguments<{mode: 'number'}>
): PgColumn<number>
export function bigint(
  ...args: ColumnArguments<{mode?: 'bigint'}>
): PgColumn<bigint>
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
): PgColumn<number>
export function bigserial(
  ...args: ColumnArguments<{mode?: 'bigint'}>
): PgColumn<bigint>
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
): PgColumn<string> {
  return new PgColumn({
    name,
    type: column.character(options?.length ?? 1)
  })
}

export function bit(
  ...args: ColumnArguments<{dimensions?: number}>
): PgColumn<string> {
  const {name, options} = columnConfig(args)
  return new PgColumn({name, type: column.bit(options?.dimensions)})
}

export function varbit(
  ...args: ColumnArguments<{dimensions?: number}>
): PgColumn<string> {
  const {name, options} = columnConfig(args)
  return new PgColumn({name, type: column.varbit(options?.dimensions)})
}

export function cidr(name?: string): PgColumn<string> {
  return new PgColumn({name, type: column.cidr()})
}

export function date(
  name?: string,
  options?: {mode: 'string'}
): PgColumn<string>
export function date(
  name: string | undefined,
  options: {mode: 'date'}
): PgColumn<Date>
export function date(name?: string, options?: {mode: 'date' | 'string'}) {
  const mode = options?.mode ?? 'date'
  return new PgColumn({
    name,
    type: column.date(),
    mapFromDriverValue(value: string | Date) {
      if (mode === 'date')
        return value instanceof Date ? value : new Date(value)
      return value instanceof Date ? formatDateString(value) : value
    },
    mapToDriverValue(value: Date) {
      return value instanceof Date ? value.toISOString() : value
    }
  })
}

export function doublePrecision(name?: string): PgColumn<number> {
  return new PgColumn({
    name,
    type: column['double precision'](),
    mapFromDriverValue(value: string | number): number {
      return typeof value === 'string' ? Number.parseFloat(value) : value
    }
  })
}

export function inet(name?: string): PgColumn<string> {
  return new PgColumn({name, type: column.inet()})
}

export function integer(name?: string): PgColumn<number> {
  return new PgColumn({name, type: column.integer()})
}

export const int = integer

export function oid(name?: string): PgColumn<number> {
  return new PgColumn({name, type: column.oid()})
}

export function point(
  ...args: ColumnArguments<{mode?: 'tuple'}>
): PgColumn<PointTuple>
export function point(...args: ColumnArguments<{mode: 'xy'}>): PgColumn<PointXY>
export function point(
  ...args: ColumnArguments<{mode?: 'tuple' | 'xy'}>
): PgColumn<PointTuple | PointXY> {
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
): PgColumn<LineTuple>
export function line(...args: ColumnArguments<{mode: 'abc'}>): PgColumn<LineABC>
export function line(
  ...args: ColumnArguments<{mode?: 'tuple' | 'abc'}>
): PgColumn<LineTuple | LineABC> {
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
): PgColumn<string> {
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

export function boolean(name?: string): PgColumn<boolean> {
  return new PgColumn({name, type: column.boolean()})
}

export function bytea(name?: string): PgColumn<Uint8Array> {
  return new PgColumn({name, type: column.bytea()})
}

export function text(name?: string): PgColumn<string> {
  return new PgColumn({name, type: column.text()})
}

export function json<T>(name?: string): PgColumn<T> {
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

export function jsonb<T>(name?: string): PgColumn<T> {
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
  ...args: ColumnArguments<{type?: GeometryType; mode?: 'tuple' | 'xy'}>
): PgColumn<PointTuple | PointXY | string> {
  const {name, options} = columnConfig(args)
  const geometryTypeName = options?.type?.toLowerCase()
  if (geometryTypeName && !GEOMETRY_TYPE.test(geometryTypeName)) {
    throw new Error(`Invalid geometry type: ${options?.type}`)
  }
  const typeArg = geometryTypeName ? sql.unsafe(geometryTypeName) : undefined
  const geometryType = options?.type
    ? new ColumnType('geometry', [], sql`geometry(${typeArg})`)
    : column.geometry()
  const mode = options?.mode ?? 'tuple'
  const mapsPoint = geometryTypeName === 'point'
  return new PgColumn({
    name,
    type: geometryType,
    mapFromDriverValue(value: string) {
      if (!mapsPoint) return value
      const [x, y] = parsePoint(value)
      return mode === 'xy' ? {x, y} : [x, y]
    },
    mapToDriverValue(value: PointTuple | PointXY | string) {
      if (!mapsPoint) return value
      return formatPoint(value)
    }
  })
}

export function vector(
  ...args: ColumnArguments<{dimensions: number}>
): PgColumn<string> {
  const {name, options} = columnConfig(args)
  return new PgColumn({name, type: column.vector(options?.dimensions)})
}

export function halfvec(
  ...args: ColumnArguments<{dimensions: number}>
): PgColumn<string> {
  const {name, options} = columnConfig(args)
  return new PgColumn({name, type: column.halfvec(options?.dimensions)})
}

export function sparsevec(
  ...args: ColumnArguments<{dimensions: number}>
): PgColumn<string> {
  const {name, options} = columnConfig(args)
  return new PgColumn({name, type: column.sparsevec(options?.dimensions)})
}

export function macaddr(name?: string): PgColumn<string> {
  return new PgColumn({name, type: column.macaddr()})
}

export function macaddr8(name?: string): PgColumn<string> {
  return new PgColumn({name, type: column.macaddr8()})
}

export function numeric(
  ...args: ColumnArguments<{precision?: number; scale?: number}>
): PgColumn<string>
export function numeric(
  ...args: ColumnArguments<{
    precision?: number
    scale?: number
    mode: 'number'
  }>
): PgColumn<number>
export function numeric(
  ...args: ColumnArguments<{
    precision?: number
    scale?: number
    mode: 'bigint'
  }>
): PgColumn<bigint>
export function numeric(
  ...args: ColumnArguments<{
    precision?: number
    scale?: number
    mode?: NumericMode
  }>
): PgColumn<string | number | bigint> {
  const {name, options} = columnConfig(args)
  const mode = options?.mode
  const mapFromDriverValue = mode && (mode === 'bigint' ? BigInt : Number)
  return new PgColumn({
    name,
    type: column.numeric(options?.precision, options?.scale),
    mapFromDriverValue
  })
}

export function real(name?: string): PgColumn<number> {
  return new PgColumn({
    name,
    type: column.real(),
    mapFromDriverValue(value: string | number): number {
      return typeof value === 'string' ? Number.parseFloat(value) : value
    }
  })
}

export function smallint(name?: string): PgColumn<number> {
  return new PgColumn({name, type: column.smallint()})
}

export function smallserial(name?: string): PgColumn<number> {
  return new PgColumn({name, type: column.smallserial()})
}

export function time(
  ...args: ColumnArguments<{precision?: Precision; withTimeZone?: boolean}>
): PgColumn<string> {
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
): PgColumn<Date>
export function timestamp(
  ...args: ColumnArguments<{
    mode: 'string'
    precision?: Precision
    withTimeZone?: boolean
    withTimezone?: boolean
  }>
): PgColumn<string>
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
  const mode = options?.mode ?? 'date'
  return new PgColumn({
    name,
    type: column[withTimeZone ? 'timestamp with time zone' : 'timestamp'](
      options?.precision
    ),
    mapFromDriverValue(value: string | Date) {
      if (mode === 'string') {
        return value instanceof Date
          ? formatTimestampString(value, !!withTimeZone)
          : value
      }
      return value instanceof Date ? value : new Date(value)
    },
    mapToDriverValue(value: Date) {
      return value instanceof Date ? value.toISOString() : value
    }
  })
}

export function uuid(name?: string): PgColumn<string> {
  return new PgColumn<string>({name, type: column.uuid()})
}

export function varchar(
  ...args: ColumnArguments<{length: number}>
): PgColumn<string> {
  const {name, options} = columnConfig(args)
  return new PgColumn({
    name,
    type: column.varchar(options?.length)
  })
}
