import {
  type Column,
  type ColumnArguments,
  JsonColumn,
  column,
  columnConfig
} from '../core/Column.ts'

export function boolean(name?: string): Column<boolean | null> {
  return column({
    name,
    type: column.integer(),
    mapFromDriverValue(value: number): boolean {
      return value === 1
    },
    mapToDriverValue(value: boolean): number {
      return value ? 1 : 0
    }
  })
}

export function integer(name?: string): Column<number | null>
export function integer(
  ...args: ColumnArguments<{mode: 'boolean'}>
): Column<boolean | null>
export function integer(
  ...args: ColumnArguments<{mode: 'timestamp'}>
): Column<Date | null>
export function integer(
  ...args: ColumnArguments<{mode: 'timestamp_ms'}>
): Column<Date | null>
export function integer(
  ...args: ColumnArguments<{mode: 'boolean' | 'timestamp' | 'timestamp_ms'}>
): Column<number | Date | boolean | null> {
  const {name, options} = columnConfig(args)
  if (options?.mode === 'timestamp' || options?.mode === 'timestamp_ms') {
    const scale = options.mode === 'timestamp' ? 1000 : 1
    return column({
      name,
      type: column.integer(),
      mapFromDriverValue(value: number | null) {
        if (value === null) return null
        return new Date(value * scale)
      },
      mapToDriverValue(value: Date) {
        return Math.floor(value.getTime() / scale)
      }
    })
  }
  if (options?.mode === 'boolean') return boolean()
  return column({name, type: column.integer()})
}

export const int = integer

export function blob(name?: string): Column<Uint8Array | null>
export function blob(
  ...args: ColumnArguments<{mode: 'bigint'}>
): Column<BigInt | null>
export function blob<T>(
  ...args: ColumnArguments<{mode: 'json'}>
): Column<T | null>
export function blob(...args: ColumnArguments<{mode: 'json' | 'bigint'}>) {
  const {name, options} = columnConfig(args)
  if (options?.mode === 'json') return json(name)
  if (options?.mode === 'bigint')
    return column({
      name,
      type: column.blob(),
      mapFromDriverValue(value: string) {
        return BigInt(value)
      },
      mapToDriverValue(value: BigInt) {
        return value.toString()
      }
    })
  return column({name, type: column.blob()})
}

export function text(name?: string): Column<string | null> {
  return column({name, type: column.text()})
}

export function real(name?: string): Column<number | null> {
  return column({name, type: column.real()})
}

export function numeric(name?: string): Column<number | null> {
  return column({name, type: column.numeric()})
}

export function json<T>(name?: string): JsonColumn<T | null> {
  return new JsonColumn({
    name,
    type: column.json(),
    mapToDriverValue(value: T): string {
      return JSON.stringify(value)
    },
    mapFromDriverValue(value: string): T {
      return JSON.parse(value)
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
    mapFromDriverValue(value: string): T {
      return JSON.parse(value)
    }
  })
}
