import {
  Column,
  type ColumnArguments,
  JsonColumn,
  column,
  columnConfig
} from '../core/Column.ts'

type Precision = 0 | 1 | 2 | 3 | 4 | 5 | 6
type IntegerMode = 'number' | 'bigint'
type DecimalMode = 'string' | 'number' | 'bigint'
type EnumInput = readonly [string, ...string[]] | Record<string, string>
type EnumValue<Values extends EnumInput> = Values extends readonly string[]
  ? Values[number]
  : Values extends Record<string, infer Value extends string>
    ? `${Value}`
    : never

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function formatDate(value: Date): string {
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
}

function formatDateTime(value: Date): string {
  const base = `${formatDate(value)} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`
  const milliseconds = value.getMilliseconds()
  return milliseconds > 0
    ? `${base}.${String(milliseconds).padStart(3, '0')}`
    : base
}

export function bigint(
  ...args: ColumnArguments<{mode: 'number'; unsigned?: boolean}>
): Column<number>
export function bigint(
  ...args: ColumnArguments<{mode?: 'bigint'; unsigned?: boolean}>
): Column<bigint>
export function bigint(
  ...args: ColumnArguments<{mode?: IntegerMode; unsigned?: boolean}>
) {
  const {name, options} = columnConfig(args)
  return new Column({
    name,
    type: column[options?.unsigned ? 'bigint unsigned' : 'bigint'](),
    mapFromDriverValue: options?.mode === 'number' ? Number : BigInt
  })
}

export function binary(
  ...args: ColumnArguments<{length?: number}>
): Column<Uint8Array> {
  const {name, options} = columnConfig(args)
  return new Column({
    name,
    type: column.binary(options?.length),
    mapFromDriverValue: value => Uint8Array.from(value as Uint8Array)
  })
}

export function boolean(name?: string): Column<boolean> {
  return new Column({
    name,
    type: column.boolean(),
    mapFromDriverValue: Boolean
  })
}

export function blob(name?: string): Column<Uint8Array> {
  return new Column({
    name,
    type: column.blob(),
    mapFromDriverValue: value => Uint8Array.from(value as Uint8Array)
  })
}

export function char(
  ...args: ColumnArguments<{length?: number}>
): Column<string> {
  const {name, options} = columnConfig(args)
  return new Column({name, type: column.char(options?.length)})
}

export function date(...args: ColumnArguments<{mode?: 'date'}>): Column<Date>
export function date(...args: ColumnArguments<{mode: 'string'}>): Column<string>
export function date(...args: ColumnArguments<{mode?: 'date' | 'string'}>) {
  const {name, options} = columnConfig(args)
  return new Column({
    name,
    type: column.date(),
    mapFromDriverValue(value: string | Date) {
      if (options?.mode === 'string')
        return value instanceof Date ? formatDate(value) : value
      return value instanceof Date ? value : new Date(value)
    },
    mapToDriverValue(value: Date) {
      return value instanceof Date ? value.toISOString().slice(0, 10) : value
    }
  })
}

export function datetime(
  ...args: ColumnArguments<{mode?: 'date'; fsp?: Precision}>
): Column<Date>
export function datetime(
  ...args: ColumnArguments<{mode: 'string'; fsp?: Precision}>
): Column<string>
export function datetime(
  ...args: ColumnArguments<{mode?: 'date' | 'string'; fsp?: Precision}>
) {
  const {name, options} = columnConfig(args)
  return new Column({
    name,
    type: column.datetime(options?.fsp),
    mapFromDriverValue(value: string | Date) {
      if (options?.mode === 'string')
        return value instanceof Date ? formatDateTime(value) : value
      return value instanceof Date
        ? value
        : new Date(`${value.replace(' ', 'T')}Z`)
    },
    mapToDriverValue(value: Date) {
      if (!(value instanceof Date)) return value
      const formatted = value.toISOString().replace('T', ' ')
      return options?.fsp
        ? formatted.slice(0, 20 + options.fsp)
        : formatted.slice(0, 19)
    }
  })
}

export function decimal(
  ...args: ColumnArguments<{
    mode?: 'string'
    precision?: number
    scale?: number
  }>
): Column<string>
export function decimal(
  ...args: ColumnArguments<{
    mode: 'number'
    precision?: number
    scale?: number
  }>
): Column<number>
export function decimal(
  ...args: ColumnArguments<{
    mode: 'bigint'
    precision?: number
    scale?: number
  }>
): Column<bigint>
export function decimal(
  ...args: ColumnArguments<{
    mode?: DecimalMode
    precision?: number
    scale?: number
  }>
) {
  const {options} = columnConfig(args)
  return decimalColumn(
    args,
    options?.mode === 'number'
      ? Number
      : options?.mode === 'bigint'
        ? BigInt
        : String
  )
}

function decimalColumn(
  args: ColumnArguments<{
    mode?: DecimalMode
    precision?: number
    scale?: number
  }>,
  mapFromDriverValue: (value: string) => string | number | bigint
) {
  const {name, options} = columnConfig(args)
  return new Column({
    name,
    type: column.decimal(options?.precision, options?.scale),
    mapFromDriverValue
  })
}

export function double(name?: string): Column<number> {
  return new Column({name, type: column.double()})
}

export function float(name?: string): Column<number> {
  return new Column({name, type: column.float()})
}

export function integer(name?: string): Column<number> {
  return new Column({name, type: column.integer()})
}

export const int = integer

export function json<T>(name?: string): JsonColumn<T> {
  return new JsonColumn({
    name,
    type: column.json(),
    mapToDriverValue(value: T): string {
      return JSON.stringify(value)
    }
  })
}

export function mysqlEnum<const Values extends EnumInput>(
  name: string,
  values: Values
): Column<EnumValue<Values>> {
  const enumValues = Array.isArray(values) ? values : Object.values(values)
  return new Column({
    name,
    type: column.enum(...enumValues)
  })
}

export function mediumint(
  ...args: ColumnArguments<{unsigned?: boolean}>
): Column<number> {
  const {name, options} = columnConfig(args)
  return new Column({
    name,
    type: column[options?.unsigned ? 'mediumint unsigned' : 'mediumint']()
  })
}

export function real(name?: string): Column<number> {
  return new Column({name, type: column.real()})
}

export function serial(name?: string): Column<number, [false, false]> {
  return new Column({name, type: column.serial()})
}

export function smallint(
  ...args: ColumnArguments<{unsigned?: boolean}>
): Column<number> {
  const {name, options} = columnConfig(args)
  return new Column({
    name,
    type: column[options?.unsigned ? 'smallint unsigned' : 'smallint']()
  })
}

export function text(name?: string): Column<string> {
  return new Column({name, type: column.text()})
}

export function tinytext(name?: string): Column<string> {
  return new Column({name, type: column.tinytext()})
}

export function mediumtext(name?: string): Column<string> {
  return new Column({name, type: column.mediumtext()})
}

export function longtext(name?: string): Column<string> {
  return new Column({name, type: column.longtext()})
}

export function time(
  ...args: ColumnArguments<{fsp?: Precision}>
): Column<string> {
  const {name, options} = columnConfig(args)
  return new Column({name, type: column.time(options?.fsp)})
}

export function timestamp(
  ...args: ColumnArguments<{mode?: 'date'; fsp?: Precision}>
): Column<Date>
export function timestamp(
  ...args: ColumnArguments<{mode: 'string'; fsp?: Precision}>
): Column<string>
export function timestamp(
  ...args: ColumnArguments<{mode?: 'date' | 'string'; fsp?: Precision}>
) {
  const {name, options} = columnConfig(args)
  return new Column({
    name,
    type: column.timestamp(options?.fsp),
    mapFromDriverValue(value: string | Date) {
      if (options?.mode === 'string')
        return value instanceof Date ? formatDateTime(value) : value
      return value instanceof Date ? value : new Date(`${value}+0000`)
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
): Column<number> {
  const {name, options} = columnConfig(args)
  return new Column({
    name,
    type: column[options?.unsigned ? 'tinyint unsigned' : 'tinyint']()
  })
}

export function varbinary(
  ...args: ColumnArguments<{length?: number}>
): Column<Uint8Array> {
  const {name, options} = columnConfig(args)
  return new Column({
    name,
    type: column.varbinary(options?.length),
    mapFromDriverValue: value => Uint8Array.from(value as Uint8Array)
  })
}

export function varchar(
  ...args: ColumnArguments<{length?: number}>
): Column<string> {
  const {name, options} = columnConfig(args)
  return new Column({name, type: column.varchar(options?.length)})
}

export function year(name?: string): Column<number> {
  return new Column({name, type: column.year()})
}
