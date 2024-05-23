import {Column, JsonColumn, column} from '../core/Column.ts'
import {sql} from '../core/Sql.ts'

export function id(name?: string): Column<number> {
  return new Column({
    name,
    type: sql.chunk('emitIdColumn', undefined),
    primary: true
  })
}

export function text(name?: string): Column<string | null> {
  return new Column({
    name,
    type: column.text()
  })
}

export function integer(name?: string): Column<number | null> {
  return new Column({
    name,
    type: column.integer()
  })
}

export function boolean(name?: string): Column<boolean | null> {
  return new Column({
    name,
    type: column.boolean(),
    mapFromDriverValue(value: unknown): boolean {
      if (typeof value === 'number') return value === 1
      return Boolean(value)
    }
  })
}

export function json<T>(name?: string): JsonColumn<T> {
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
