import {JsonColumn, column, type Column} from '../core/Column.ts'
import {sql} from '../core/Sql.ts'

const idType = sql.universal({
  sqlite: sql`integer`,
  postgres: sql`integer generated always as identity`,
  mysql: sql`int not null auto_increment`
})

const blobType = sql.universal({
  postgres: sql`bytea`,
  default: sql`blob`
})

export function id(name?: string): Column<number> {
  return column({
    name,
    type: idType,
    primary: true
  })
}

export function text(name?: string): Column<string | null> {
  return column({name, type: column.text()})
}

export function integer(name?: string): Column<number | null> {
  return column({name, type: column.integer()})
}

export function boolean(name?: string): Column<boolean | null> {
  return column({
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

export function blob(name?: string): Column<Uint8Array | null> {
  return column({name, type: blobType})
}
