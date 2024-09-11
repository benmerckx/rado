import {type Column, JsonColumn, column} from '../core/Column.ts'
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

const numberType = sql.universal({
  mysql: sql`double`,
  default: sql`numeric`
})

const jsonbType = sql.universal({
  mysql: sql`json`,
  default: sql`jsonb`
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

export function varchar(
  name?: string,
  options?: {length: number}
): Column<string | null> {
  return column({name, type: column.varchar(options?.length)})
}

export function integer(name?: string): Column<number | null> {
  return column({name, type: column.integer()})
}

export function number(name?: string): Column<number | null> {
  return column({name, type: numberType, mapFromDriverValue: Number})
}

export function boolean(name?: string): Column<boolean | null> {
  return column({
    name,
    type: column.boolean(),
    mapFromDriverValue: Boolean
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

export function jsonb<T>(name?: string): JsonColumn<T> {
  return new JsonColumn({
    name,
    type: jsonbType,
    mapToDriverValue(value: T): string {
      return JSON.stringify(value)
    },
    mapFromDriverValue(value: unknown, {parsesJson}) {
      return parsesJson ? value : JSON.parse(value as string)
    }
  })
}

export function blob(name?: string): Column<Uint8Array | null> {
  return column({
    name,
    type: blobType,
    mapFromDriverValue(value) {
      return new Uint8Array(value as ArrayBufferLike)
    }
  })
}
