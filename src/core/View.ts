import {
  type HasCreate,
  type HasDrop,
  type HasSql,
  type HasTarget,
  getData,
  getQuery,
  getSelection,
  internalCreate,
  internalData,
  internalDrop
} from './Internal.ts'
import type {QueryMeta} from './MetaData.ts'
import {type Sql, sql} from './Sql.ts'
import {type TableDefinition, type TableFields, tableFields} from './Table.ts'
import {type VirtualTarget, virtualTarget} from './Virtual.ts'
import type {UnionBase} from './query/Select.ts'

interface ViewData {
  name: string
  columns?: TableDefinition
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
  const {columns} = data
  const columnList = columns
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
    return {
      ...virtualTarget(data.name, getSelection(query).input as Input),
      get [internalCreate]() {
        const result = createView(data, getQuery(query))
        return [result]
      },
      get [internalDrop]() {
        return [dropView(data)]
      }
    }
  }
}

export class DefinedView<Definition extends TableDefinition> extends ViewBase {
  existing(): VirtualTarget<TableFields<Definition>> {
    const {name, columns} = getData(this)
    const fields = tableFields(name, columns!) as TableFields<Definition>
    return virtualTarget(name, fields)
  }

  as(query: HasSql): View & TableFields<Definition> {
    const data = getData(this)
    const fields = tableFields(
      data.name,
      data.columns!
    ) as TableFields<Definition>
    return {
      ...virtualTarget(data.name, fields),
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
