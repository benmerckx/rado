import {
  type HasCreate,
  type HasDrop,
  type HasSql,
  type HasTarget,
  getData,
  getField,
  getQuery,
  getSelection,
  getSql,
  hasField,
  hasSql,
  internalCreate,
  internalData,
  internalDrop,
  internalQuery,
  internalSelection,
  internalTarget
} from './Internal.ts'
import type {QueryMeta} from './MetaData.ts'
import type {SelectionInput} from './Selection.ts'
import {selection} from './Selection.ts'
import {type Sql, sql} from './Sql.ts'
import {type TableDefinition, type TableFields, tableFields} from './Table.ts'
import type {VirtualTarget} from './Virtual.ts'
import {Field} from './expr/Field.ts'
import type {UnionBase} from './query/Select.ts'

interface ViewData {
  name: string
  columns?: TableDefinition
  columnNames?: Array<string>
  schemaName?: string
  materialized?: boolean
  query?: Sql
}

export class ViewBase {
  readonly [internalData]: ViewData

  constructor(data: ViewData) {
    this[internalData] = data
  }
}

export interface View extends HasTarget, HasCreate, HasDrop {}

function viewIdentifier({name, schemaName}: ViewData): Sql {
  return schemaName
    ? sql.join([sql.identifier(schemaName), sql.identifier(name)], sql`.`)
    : sql.identifier(name)
}

export function createView(data: ViewData, as: HasSql): Sql {
  const createKeyword = data.materialized
    ? sql`create materialized view`
    : sql`create view`
  const {columns, columnNames} = data
  const columnList = columnNames
    ? sql.join(
        columnNames.map(name => sql.identifier(name)),
        sql`, `
      )
    : columns
      ? sql.join(
          Object.entries(columns).map(([name, column]) => {
            const columnData = getData(column)
            return sql.identifier(columnData.name ?? name)
          }),
          sql`, `
        )
      : undefined
  return sql
    .join([
      createKeyword,
      viewIdentifier(data),
      columnList ? sql`(${columnList})` : undefined,
      sql`as`,
      as
    ])
    .inlineValues()
}

function viewColumnNames(input: SelectionInput): Array<string> {
  const expr = getSql(input as HasSql)
  if (expr) {
    if (hasField(input)) return [getField(input).fieldName]
    if (expr.alias) return [expr.alias]
    throw new Error('Missing field name')
  }
  return Object.entries(input).flatMap(([name, value]) => {
    const expr = getSql(value as HasSql)
    if (expr && !hasField(value)) return [expr.alias ?? name]
    return viewColumnNames(value)
  })
}

function viewFields(
  alias: string,
  source: SelectionInput
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(source).map(([key, value]) => {
      if (value && typeof value === 'object' && !hasSql(value))
        return [key, viewFields(alias, value as SelectionInput)]
      const fieldName = hasField(value) ? getField(value).fieldName : key
      return [key, new Field(alias, fieldName, getSql(value as HasSql))]
    })
  )
}

export function dropView(data: ViewData): Sql {
  const dropKeyword = data.materialized
    ? sql`drop materialized view`
    : sql`drop view`
  return sql.join([dropKeyword, sql`if exists`, viewIdentifier(data)])
}

export class QueryView extends ViewBase {
  as<Input, Meta extends QueryMeta>(
    query: UnionBase<Input, Meta>
  ): View & Input {
    const data = getData(this)
    const input = getSelection(query).input as Input
    const target = {
      [internalTarget]: viewIdentifier(data),
      ...viewFields(data.name, input as SelectionInput)
    }
    const createData = {
      ...data,
      columnNames: viewColumnNames(input as SelectionInput)
    }
    return <View & Input>(<unknown>{
      ...target,
      [internalSelection]: selection(target),
      [internalQuery]: getQuery(query),
      get [internalCreate]() {
        const result = createView(createData, getQuery(query))
        return [result]
      },
      get [internalDrop]() {
        return [dropView(data)]
      }
    })
  }
}

export class DefinedView<Definition extends TableDefinition> extends ViewBase {
  existing(): VirtualTarget<TableFields<Definition>> {
    const data = getData(this)
    const {name, columns} = data
    const fields = tableFields(name, columns!) as TableFields<Definition>
    return {
      [internalTarget]: viewIdentifier(data),
      ...fields,
      [internalSelection]: selection(fields)
    }
  }

  as(query: HasSql): View & TableFields<Definition> {
    const data = getData(this)
    const fields = tableFields(
      data.name,
      data.columns!
    ) as TableFields<Definition>
    return {
      [internalTarget]: viewIdentifier(data),
      ...fields,
      [internalSelection]: selection(fields),
      [internalQuery]: getSql(query),
      get [internalCreate]() {
        const result = createView(data, query)
        return [result]
      },
      get [internalDrop]() {
        return [dropView(data)]
      }
    }
  }
}

export function view(name: string): QueryView
export function view<Definition extends TableDefinition>(
  name: string,
  columns: Definition,
  schemaName?: string
): DefinedView<Definition>
export function view(
  name: string,
  columns?: TableDefinition,
  schemaName?: string
) {
  if (columns) return new DefinedView({name, columns, schemaName})
  return new QueryView({name, columns, schemaName})
}

export function materializedView(name: string): QueryView
export function materializedView<Definition extends TableDefinition>(
  name: string,
  columns: Definition,
  schemaName?: string
): DefinedView<Definition>
export function materializedView(
  name: string,
  columns?: TableDefinition,
  schemaName?: string
) {
  const data = {name, columns, schemaName, materialized: true}
  if (columns) return new DefinedView(data)
  return new QueryView(data)
}
