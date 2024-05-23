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

export function integer(name?: string): Column<number | null> {
  return column({name, type: column.integer()})
}

export const int = integer

export function blob(name?: string): Column<Uint8Array | null> {
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
