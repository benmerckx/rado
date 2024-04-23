import {Column, JsonColumn} from '../core/Column.ts'
import {sql} from '../core/Sql.ts'

export function serial(name?: string): Column<number | null> {
  return new Column({
    name,
    type: sql`serial`
  })
}

export function boolean(name?: string): Column<boolean | null> {
  return new Column({
    name,
    type: sql`boolean`
  })
}

export function integer(name?: string): Column<number | null> {
  return new Column({name, type: sql`integer`})
}

export function blob(name?: string): Column<Uint8Array | null> {
  return new Column({name, type: sql`blob`})
}

export function text(name?: string): Column<string | null> {
  return new Column({name, type: sql`text`})
}

export function real(name?: string): Column<number | null> {
  return new Column({name, type: sql`real`})
}

export function numeric(name?: string): Column<number | null> {
  return new Column({name, type: sql`numeric`})
}

export function json<T>(name?: string): JsonColumn<T | null> {
  return new JsonColumn({
    name,
    type: sql`json`,
    mapToDriverValue(value: T): string {
      return JSON.stringify(value)
    }
  })
}

export function jsonb<T>(name?: string): JsonColumn<T | null> {
  return new JsonColumn({
    name,
    type: sql`jsonb`,
    mapToDriverValue(value: T): string {
      return JSON.stringify(value)
    }
  })
}