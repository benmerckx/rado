import type {Column} from '../core/Column.ts'
import {ColumnType, column} from '../core/Column.ts'
import type {HasTable} from '../core/Internal.ts'
import {
  getData,
  getEnum,
  getTable,
  hasEnum,
  internalEnum
} from '../core/Internal.ts'
import type {Sql} from '../core/Sql.ts'
import {sql} from '../core/Sql.ts'

export type PgEnum<Values extends readonly string[] = readonly string[]> = {
  (name?: string): Column<Values[number] | null>
}

export interface PgEnumInfo {
  name: string
  schema?: string
  values: readonly string[]
}

export function pgEnum<
  const Name extends string,
  const Values extends readonly [string, ...string[]]
>(name: Name, values: Values, schemaName?: string): PgEnum<Values> {
  const enumIdentifier = schemaName
    ? sql.join([sql.identifier(schemaName), sql.identifier(name)], sql`.`)
    : sql.identifier(name)
  const enumType = new ColumnType(name, [], enumIdentifier)
  return (columnName?: string) => {
    return column({
      name: columnName,
      type: enumType,
      [internalEnum]: {name, schema: schemaName, values}
    })
  }
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

export function collectEnumQuery(tables: Array<HasTable>): Array<Sql> {
  const enums: Array<Sql> = []
  const seen = new Set<string>()
  for (const table of tables) {
    const tableApi = getTable(table)
    for (const column of Object.values(tableApi.columns)) {
      const data = getData(column)
      if (!hasEnum<PgEnumInfo>(data)) continue
      const info = getEnum<PgEnumInfo>(data)
      const enumKey = info.schema ? `${info.schema}.${info.name}` : info.name
      if (seen.has(enumKey)) continue
      seen.add(enumKey)
      enums.push(enumQuery(info))
    }
  }
  return enums
}
