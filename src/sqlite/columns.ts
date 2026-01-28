import {
  Column,
  type ColumnArguments,
  JsonColumn,
  column,
  columnConfig
} from '../core/Column.ts'

export function boolean(name?: string): Column<boolean> {
  return new Column({
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

export function integer(name?: string): Column<number>
export function integer(
  ...args: ColumnArguments<{mode: 'boolean'}>
): Column<boolean>
export function integer(
  ...args: ColumnArguments<{mode: 'timestamp'}>
): Column<Date>
export function integer(
  ...args: ColumnArguments<{mode: 'timestamp_ms'}>
): Column<Date>
export function integer(
  ...args: ColumnArguments<{mode: 'number'}>
): Column<number>
export function integer(
  ...args: ColumnArguments<{
    mode: 'boolean' | 'timestamp' | 'timestamp_ms' | 'number'
  }>
): Column<number | Date | boolean> {
  const {name, options} = columnConfig(args)
  if (options?.mode === 'timestamp' || options?.mode === 'timestamp_ms') {
    const scale = options.mode === 'timestamp' ? 1000 : 1
    return new Column({
      name,
      type: column.integer(),
      mapFromDriverValue(value: number) {
        if (value === null) return null
        return new Date(value * scale)
      },
      mapToDriverValue(value: Date) {
        return Math.floor(value.getTime() / scale)
      }
    })
  }
  if (options?.mode === 'boolean') return boolean()
  return new Column({name, type: column.integer()})
}

export const int = integer

export function blob(name?: string): Column<Uint8Array>
export function blob(...args: ColumnArguments<{mode: 'bigint'}>): Column<BigInt>
export function blob<T>(...args: ColumnArguments<{mode: 'json'}>): Column<T>
export function blob(
  ...args: ColumnArguments<{mode: 'buffer'}>
): Column<ArrayBuffer>
export function blob(
  ...args: ColumnArguments<{mode: 'json' | 'bigint' | 'buffer'}>
) {
  const {name, options} = columnConfig(args)
  if (options?.mode === 'json') return json(name)
  if (options?.mode === 'bigint')
    return new Column({
      name,
      type: column.blob(),
      mapFromDriverValue(value: string) {
        return BigInt(value)
      },
      mapToDriverValue(value: BigInt) {
        return value.toString()
      }
    })
  if (options?.mode === 'buffer')
    return new Column({
      name,
      type: column.blob(),
      mapFromDriverValue(value: unknown) {
        if (value instanceof ArrayBuffer) return value
        if (value && typeof value === 'object' && ArrayBuffer.isView(value)) {
          const view = value as ArrayBufferView
          return view.buffer.slice(
            view.byteOffset,
            view.byteOffset + view.byteLength
          )
        }
        return value as ArrayBuffer
      },
      mapToDriverValue(value: ArrayBuffer | Uint8Array) {
        return value instanceof ArrayBuffer ? new Uint8Array(value) : value
      }
    })
  return new Column({name, type: column.blob()})
}

export function text(name?: string): Column<string>
export function text<const Values extends readonly string[]>(
  ...args: ColumnArguments<{mode?: 'text'; length?: number; enum?: Values}>
): Column<Values[number]>
export function text<T>(
  ...args: ColumnArguments<{mode: 'json'; length?: number}>
): JsonColumn<T>
export function text(
  ...args: ColumnArguments<{
    mode?: 'text' | 'json'
    length?: number
    enum?: readonly string[]
  }>
): Column<string> | JsonColumn<unknown> {
  const {name, options} = columnConfig(args)
  if (options?.mode === 'json')
    return new JsonColumn({
      name,
      type: column.text(options?.length),
      mapToDriverValue(value: unknown): string {
        return JSON.stringify(value)
      },
      mapFromDriverValue(value: string): unknown {
        return JSON.parse(value)
      }
    })
  return new Column({name, type: column.text(options?.length)})
}

export function real(name?: string): Column<number> {
  return new Column({name, type: column.real()})
}

export function numeric(name?: string): Column<number> {
  return new Column({name, type: column.numeric()})
}

export function json<T>(name?: string): JsonColumn<T> {
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

export function jsonb<T>(name?: string): JsonColumn<T> {
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
