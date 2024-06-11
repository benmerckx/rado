import {JsonColumn, column, type Column} from '../core/Column.ts'

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
    type: column.char(options?.length)
  })
}

export function cidr(name?: string): Column<string | null> {
  return column({name, type: column.cidr()})
}

export function date(
  name: string | undefined,
  options: {mode: 'date'}
): Column<Date | null>
export function date(name?: string): Column<string | null>
export function date(name?: string, options?: {mode: 'date'}) {
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

export function interval(
  name?: string,
  options?: {fields?: IntervalFields; precision?: Precision}
): Column<string | null> {
  return column({
    name,
    type: column[options?.fields ? `interval ${options.fields}` : 'interval'](
      options?.precision
    )
  })
}

export function serial(name?: string): Column<number | null> {
  return column({name, type: column.serial()})
}

export function boolean(name?: string): Column<boolean | null> {
  return column({name, type: column.boolean()})
}

export function blob(name?: string): Column<Uint8Array | null> {
  return column({name, type: column.blob()})
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

export function macaddr(name?: string): Column<string | null> {
  return column({name, type: column.macaddr()})
}

export function macaddr8(name?: string): Column<string | null> {
  return column({name, type: column.macaddr8()})
}

export function numeric(
  name?: string,
  options?: {precision?: number; scale?: number}
): Column<number | null> {
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
  name: string | undefined,
  options?: {precision?: Precision; withTimeZone?: boolean}
): Column<string | null> {
  return column({
    name,
    type: column[options?.withTimeZone ? 'time with time zone' : 'time'](
      options?.precision
    )
  })
}

export function timestamp(
  name: string | undefined,
  options?: {precision?: Precision; withTimeZone?: boolean}
): Column<Date | null>
export function timestamp(
  name?: string,
  options?: {mode: 'string'; precision?: Precision; withTimeZone?: boolean}
): Column<string | null>
export function timestamp(
  name?: string,
  options?: {mode?: 'string'; precision?: Precision; withTimeZone?: boolean}
): Column<string | null> | Column<Date | null> {
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
  name?: string,
  options?: {length: number}
): Column<string | null> {
  return column({
    name,
    type: column.varchar(options?.length)
  })
}
