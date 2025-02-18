import {type Column, JsonColumn, column} from '../core/Column.ts'

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
  name: string,
  options: {mode: 'boolean'}
): Column<boolean | null>
export function integer(
  name: string,
  options: {mode: 'timestamp'}
): Column<Date | null>
export function integer(
  name?: string,
  options?: {mode: 'boolean' | 'timestamp'}
): Column<number | Date | boolean | null> {
  if (options?.mode === 'timestamp')
    return column({
      name,
      type: column.integer(),
      mapFromDriverValue(value: string) {
        return new Date(`${value}+0000`)
      },
      mapToDriverValue(value: Date) {
        return value instanceof Date
          ? value.toISOString().slice(0, -1).replace('T', ' ')
          : value
      }
    })
  if (options?.mode === 'boolean') return boolean()
  return column({name, type: column.integer()})
}

export const int = integer

export function blob<T>(
  name?: string,
  options?: {mode: 'json'}
): Column<T | null>
export function blob(name?: string): Column<Uint8Array | null>
export function blob(name?: string, options?: {mode: 'json'}) {
  if (options?.mode === 'json') return json(name)
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
