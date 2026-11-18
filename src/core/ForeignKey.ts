import type {ColumnData, ReferenceOptions} from './Column.ts'
import {ForeignKeyConstraint} from './Constraint.ts'
import type {FieldData} from './expr/Field.ts'
import {getData} from './Internal.ts'
import type {ForeignKeyShape, Shape} from './Shape.ts'
import {type Sql, sql} from './Sql.ts'
import type {TableApi, TableConfigResult} from './Table.ts'

const {entries, fromEntries} = Object

export const key = (schema: string | undefined, name: string): string =>
  `${schema ?? ''}.${name}`

// Column data and the property key, by database column name
export function columns(
  api: TableApi
): Record<string, ColumnData & {key: string}> {
  return fromEntries(
    entries(api.columns).map(([key, column]) => {
      const data = getData(column)
      return [data.name ?? key, {...data, key}]
    })
  )
}

export function configEntries(
  config?: TableConfigResult
): Array<[string | undefined, unknown]> {
  if (!config) return []
  if (Array.isArray(config)) return config.map(value => [undefined, value])
  return entries(config)
}

export function isForeignKey(value: unknown): value is ForeignKeyConstraint {
  return (
    value instanceof ForeignKeyConstraint && Boolean(getData(value).references)
  )
}

export function foreignKeys(api: TableApi): Array<ForeignKeyShape> {
  const result: Array<ForeignKeyShape> = []
  const add = (
    columns: Array<string>,
    fields: Array<FieldData>,
    options: ReferenceOptions = {},
    name?: string,
    inline = false
  ) =>
    result.push({
      name,
      columns,
      schema: fields[0].schemaName,
      table: fields[0].targetName,
      references: fields.map(field => field.fieldName),
      onDelete: options.onDelete ?? 'no action',
      onUpdate: options.onUpdate ?? 'no action',
      inline
    })
  for (const [name, data] of entries(columns(api)))
    if (data.references)
      add([name], [data.references()], data.referenceOptions, name, true)
  for (const [key, value] of configEntries(api.config?.()))
    if (isForeignKey(value)) {
      const {name = key, fields, references} = getData(value)
      add(
        fields.map(field => field.fieldName),
        references,
        {},
        name
      )
    }
  return result
}

export function signature(foreignKey: ForeignKeyShape): string {
  const {columns, schema, table, references, onDelete, onUpdate} = foreignKey
  const target = key(schema, table)
  return `(${columns}) ${target}(${references}) ${onDelete} ${onUpdate}`
}

// Unqualified references resolve to the home schema
export function foreignKeyChanges(
  api: TableApi,
  live: Shape,
  home?: string
): {dropped: Array<ForeignKeyShape>; added: Array<ForeignKeyShape>} {
  const local = (foreignKey: ForeignKeyShape) =>
    signature({
      ...foreignKey,
      schema: foreignKey.schema === home ? undefined : foreignKey.schema
    })
  const wanted = foreignKeys(api)
  const current = new Set(live.foreignKeys.map(local))
  const kept = new Set(wanted.map(local))
  return {
    dropped: live.foreignKeys.filter(
      foreignKey => !kept.has(local(foreignKey))
    ),
    added: wanted.filter(foreignKey => !current.has(local(foreignKey)))
  }
}

export function foreignKey(shape: ForeignKeyShape): Sql {
  const list = (names: Array<string>) =>
    sql.join(names.map(sql.identifier), sql`, `)
  const table = sql.identifier(shape.table)
  const target = shape.schema
    ? sql`${sql.identifier(shape.schema)}.${table}`
    : table
  return sql.join([
    shape.name && !shape.inline
      ? sql`constraint ${sql.identifier(shape.name)}`
      : undefined,
    sql`foreign key (${list(shape.columns)})`,
    sql`references ${target} (${list(shape.references)})`,
    shape.onDelete !== 'no action' &&
      sql`on delete ${sql.unsafe(shape.onDelete)}`,
    shape.onUpdate !== 'no action' &&
      sql`on update ${sql.unsafe(shape.onUpdate)}`
  ])
}
