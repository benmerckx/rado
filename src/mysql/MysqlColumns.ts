import {Column, JsonColumn, column} from '../core/Column.ts'

type Precision = 0 | 1 | 2 | 3 | 4 | 5 | 6

export function bigint(
  name: string | undefined,
  options: {mode: 'number'; unsigned?: boolean}
): Column<number | null>
export function bigint(
  name?: string,
  options?: {unsigned?: boolean}
): Column<bigint | null>
export function bigint(
  name?: string,
  options?: {mode?: 'number'; unsigned?: boolean}
) {
  return new Column({
    name,
    type: column[options?.unsigned ? 'bigint unsigned' : 'bigint'](),
    mapFromDriverValue: options?.mode === 'number' ? Number : BigInt
  })
}

export function binary(
  name?: string,
  options?: {length?: number}
): Column<Uint8Array | null> {
  return new Column({name, type: column.binary(options?.length)})
}

export function boolean(name?: string): Column<boolean | null> {
  return new Column({name, type: column.boolean()})
}

export function char(
  name?: string,
  options?: {length: number}
): Column<string | null> {
  return new Column({name, type: column.char(options?.length)})
}

export function date(
  name: string | undefined,
  options: {mode: 'date'}
): Column<Date | null>
export function date(name?: string): Column<string | null>
export function date(name?: string, options?: {mode: 'date'}) {
  return new Column({
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

export function datetime(
  name?: string,
  options?: {fsp?: Precision}
): Column<Date | null>
export function datetime(
  name: string | undefined,
  options: {mode: 'string'; fsp?: Precision}
): Column<string | null>
export function datetime(
  name?: string,
  options?: {mode?: 'string'; fsp?: Precision}
) {
  return new Column({
    name,
    type: column.datetime(options?.fsp),
    mapFromDriverValue(value: string) {
      return options?.mode === 'string' ? value : new Date(value)
    },
    mapToDriverValue(value: Date) {
      return value instanceof Date ? value.toISOString() : value
    }
  })
}

export function decimal(
  name: string | undefined,
  options: {precision?: number; scale?: number}
): Column<number | null> {
  return new Column({
    name,
    type: column.decimal(options.precision, options.scale)
  })
}

export function float(name?: string): Column<number | null> {
  return new Column({name, type: column.float()})
}

export function integer(name?: string): Column<number | null> {
  return new Column({name, type: column.integer()})
}

export const int = integer

export function json<T>(name?: string): JsonColumn<T | null> {
  return new JsonColumn({
    name,
    type: column.json(),
    mapToDriverValue(value: T): string {
      return JSON.stringify(value)
    }
  })
}

export function mediumint(
  name?: string,
  options?: {unsigned?: boolean}
): Column<number | null> {
  return new Column({
    name,
    type: column[options?.unsigned ? 'mediumint unsigned' : 'mediumint']()
  })
}

export function real(name?: string): Column<number | null> {
  return new Column({name, type: column.real()})
}

export function serial(name?: string): Column<number | null> {
  return new Column({name, type: column.serial()})
}

export function smallint(
  name?: string,
  options?: {unsigned?: boolean}
): Column<number | null> {
  return new Column({
    name,
    type: column[options?.unsigned ? 'smallint unsigned' : 'smallint']()
  })
}

export function text(name?: string): Column<string | null> {
  return new Column({name, type: column.text()})
}

export function tinytext(name?: string): Column<string | null> {
  return new Column({name, type: column.tinytext()})
}

export function mediumtext(name?: string): Column<string | null> {
  return new Column({name, type: column.mediumtext()})
}

export function longtext(name?: string): Column<string | null> {
  return new Column({name, type: column.longtext()})
}

export function time(
  name?: string,
  options?: {fsp?: Precision}
): Column<string | null> {
  return new Column({name, type: column.time(options?.fsp)})
}

export function timestamp(
  name: string | undefined,
  options?: {fsp?: Precision}
): Column<Date | null>
export function timestamp(
  name?: string,
  options?: {mode: 'string'; fsp?: Precision}
): Column<string | null>
export function timestamp(
  name?: string,
  options?: {mode?: 'string'; fsp?: Precision}
) {
  return new Column({
    name,
    type: column.timestamp(options?.fsp),
    mapFromDriverValue(value: string) {
      return options?.mode === 'string' ? value : new Date(`${value}+0000`)
    },
    mapToDriverValue(value: Date) {
      return value instanceof Date
        ? value.toISOString().slice(0, -1).replace('T', ' ')
        : value
    }
  })
}

export function tinyint(
  name?: string,
  options?: {unsigned?: boolean}
): Column<number | null> {
  return new Column({
    name,
    type: column[options?.unsigned ? 'tinyint unsigned' : 'tinyint']()
  })
}

export function varbinary(
  name?: string,
  options?: {length?: number}
): Column<Uint8Array | null> {
  return new Column({name, type: column.varbinary(options?.length)})
}

export function varchar(
  name?: string,
  options?: {length: number}
): Column<string | null> {
  return new Column({name, type: column.varchar(options?.length)})
}

export function year(name?: string): Column<number | null> {
  return new Column({name, type: column.year()})
}
