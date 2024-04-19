import {Column, JsonColumn} from '../core/Column.ts'
import {sql} from '../core/Sql.ts'

export function id(name?: string): Column<number> {
  return new Column({
    name,
    type: sql.chunk('emitIdColumn', undefined)
  })
}

export function text(name?: string): Column<string | null> {
  return new Column({
    name,
    type: sql`text`
  })
}

export function int(name?: string): Column<number | null> {
  return new Column({
    name,
    type: sql`int`
  })
}

export function boolean(name?: string): Column<boolean | null> {
  return new Column({
    name,
    type: sql`boolean`,
    mapFromDriverValue(value: unknown): boolean {
      if (typeof value === 'number') return value === 1
      return Boolean(value)
    }
  })
}

export function json<T>(name?: string): JsonColumn<T> {
  return new JsonColumn({
    name,
    type: sql`jsonb`,
    mapFromDriverValue(value: string): T {
      return JSON.parse(value)
    },
    mapToDriverValue(value: T): string {
      return JSON.stringify(value)
    }
  })
}
