import {
  type Column,
  type ColumnArguments,
  JsonColumn,
  column,
  columnConfig
} from '../core/Column.ts'

type Precision = 0 | 1 | 2 | 3 | 4 | 5 | 6

export function bigint(
  ...args: ColumnArguments<{mode: 'number'; unsigned?: boolean}>
): Column<number | null>
export function bigint(
  ...args: ColumnArguments<{unsigned?: boolean}>
): Column<bigint | null>
export function bigint(
  ...args: ColumnArguments<{mode?: 'number'; unsigned?: boolean}>
) {
  const {name, options} = columnConfig(args)
  return column({
    name,
    type: column[options?.unsigned ? 'bigint unsigned' : 'bigint'](),
    mapFromDriverValue: options?.mode === 'number' ? Number : BigInt
  })
}

export function binary(
  ...args: ColumnArguments<{length?: number}>
): Column<Uint8Array | null> {
  const {name, options} = columnConfig(args)
  return column({name, type: column.binary(options?.length)})
}

export function boolean(name?: string): Column<boolean | null> {
  return column({name, type: column.boolean()})
}

export function blob(name?: string): Column<Uint8Array | null> {
  return column({name, type: column.blob()})
}

export function char(
  ...args: ColumnArguments<{length?: number}>
): Column<string | null> {
  const {name, options} = columnConfig(args)
  return column({name, type: column.char(options?.length)})
}

export function date(
  ...args: ColumnArguments<{mode: 'string'}>
): Column<string | null>
export function date(
  ...args: ColumnArguments<{mode: 'date'}>
): Column<Date | null>
export function date(...args: ColumnArguments<{mode: 'date' | 'string'}>) {
  const {name, options} = columnConfig(args)
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

export function datetime(
  ...args: ColumnArguments<{fsp?: Precision}>
): Column<Date | null>
export function datetime(
  ...args: ColumnArguments<{mode: 'string'; fsp?: Precision}>
): Column<string | null>
export function datetime(
  ...args: ColumnArguments<{mode?: 'string'; fsp?: Precision}>
) {
  const {name, options} = columnConfig(args)
  return column({
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
  ...args: ColumnArguments<{precision?: number; scale?: number}>
): Column<number | null> {
  const {name, options} = columnConfig(args)
  return column({
    name,
    type: column.decimal(options?.precision, options?.scale)
  })
}

export function float(name?: string): Column<number | null> {
  return column({name, type: column.float()})
}

export function integer(name?: string): Column<number | null> {
  return column({name, type: column.integer()})
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
  ...args: ColumnArguments<{unsigned?: boolean}>
): Column<number | null> {
  const {name, options} = columnConfig(args)
  return column({
    name,
    type: column[options?.unsigned ? 'mediumint unsigned' : 'mediumint']()
  })
}

export function real(name?: string): Column<number | null> {
  return column({name, type: column.real()})
}

export function serial(name?: string): Column<number | null> {
  return column({name, type: column.serial()})
}

export function smallint(
  ...args: ColumnArguments<{unsigned?: boolean}>
): Column<number | null> {
  const {name, options} = columnConfig(args)
  return column({
    name,
    type: column[options?.unsigned ? 'smallint unsigned' : 'smallint']()
  })
}

export function text(name?: string): Column<string | null> {
  return column({name, type: column.text()})
}

export function tinytext(name?: string): Column<string | null> {
  return column({name, type: column.tinytext()})
}

export function mediumtext(name?: string): Column<string | null> {
  return column({name, type: column.mediumtext()})
}

export function longtext(name?: string): Column<string | null> {
  return column({name, type: column.longtext()})
}

export function time(
  ...args: ColumnArguments<{fsp?: Precision}>
): Column<string | null> {
  const {name, options} = columnConfig(args)
  return column({name, type: column.time(options?.fsp)})
}

export function timestamp(
  ...args: ColumnArguments<{fsp?: Precision}>
): Column<Date | null>
export function timestamp(
  ...args: ColumnArguments<{mode: 'string'; fsp?: Precision}>
): Column<string | null>
export function timestamp(
  ...args: ColumnArguments<{mode?: 'string'; fsp?: Precision}>
) {
  const {name, options} = columnConfig(args)
  return column({
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
  ...args: ColumnArguments<{unsigned?: boolean}>
): Column<number | null> {
  const {name, options} = columnConfig(args)
  return column({
    name,
    type: column[options?.unsigned ? 'tinyint unsigned' : 'tinyint']()
  })
}

export function varbinary(
  ...args: ColumnArguments<{length?: number}>
): Column<Uint8Array | null> {
  const {name, options} = columnConfig(args)
  return column({name, type: column.varbinary(options?.length)})
}

export function varchar(
  ...args: ColumnArguments<{length?: number}>
): Column<string | null> {
  const {name, options} = columnConfig(args)
  return column({name, type: column.varchar(options?.length)})
}

export function year(name?: string): Column<number | null> {
  return column({name, type: column.year()})
}
