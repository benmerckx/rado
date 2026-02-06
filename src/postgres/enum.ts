import {ColumnType} from '../core/Column.ts'
import {
  type HasCreate,
  type HasDrop,
  get,
  internal
} from '../core/Internal.ts'
import type {Sql} from '../core/Sql.ts'
import {sql} from '../core/Sql.ts'
import type {TableApi} from '../core/Table.ts'
import {PgColumn} from './columns.ts'

interface PgEnumInternal {
  create: Array<Sql>
  drop: Array<Sql>
}

export interface PgEnum<Values extends EnumInput> {
  readonly [internal]: PgEnumInternal
  (name?: string): PgColumn<Values[keyof Values] | null>
}

export interface PgEnumInfo {
  name: string
  schema?: string
  values: readonly string[]
}

type EnumInput = readonly [string, ...string[]] | Record<string, string>

export function pgEnum<
  const Name extends string,
  const Values extends EnumInput
>(name: Name, values: Values, schemaName?: string): PgEnum<Values> {
  const enumIdentifier = schemaName
    ? sql.join([sql.identifier(schemaName), sql.identifier(name)], sql`.`)
    : sql.identifier(name)
  const enumType = new ColumnType(name, [], enumIdentifier)
  const v = Array.isArray(values) ? values : Object.values(values)
  const info: PgEnumInfo = {name, schema: schemaName, values: v}
  return Object.assign(
    (columnName?: string) => {
      return new PgColumn({
        name: columnName,
        type: enumType,
        enum: info
      })
    },
    {
      [internal]: {
        get create() {
          return [enumQuery(info)]
        },
        get drop() {
          return [sql`drop type if exists ${enumIdentifier}`]
        }
      }
    }
  )
}

export function enumQuery(enumInfo: PgEnumInfo): Sql {
  const enumIdentifier = enumInfo.schema
    ? sql.join(
        [sql.identifier(enumInfo.schema), sql.identifier(enumInfo.name)],
        sql`.`
      )
    : sql.identifier(enumInfo.name)
  return sql`do $$ begin create type ${enumIdentifier} as enum (${sql.join(
    enumInfo.values.map(sql.inline),
    sql`, `
  )}); exception when duplicate_object then null; end $$`
}

export function collectEnumQuery(table: TableApi): Array<Sql> {
  const enums: Array<Sql> = []
  const seen = new Set<string>()
  for (const column of Object.values(table.columns)) {
    const data = get(column)
    const info = data.enum as PgEnumInfo | undefined
    if (!info) continue
    const enumKey = info.schema ? `${info.schema}.${info.name}` : info.name
    if (seen.has(enumKey)) continue
    seen.add(enumKey)
    enums.push(enumQuery(info))
  }
  return enums
}
