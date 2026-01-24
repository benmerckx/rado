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
}

export class ViewBase {
  readonly [internalData]: ViewData

  constructor(data: ViewData) {
    this[internalData] = data
  }
}

export interface View extends HasTarget, HasCreate, HasDrop {}

export function createView(data: ViewData, as: HasSql): Sql {
  return sql.join([
    sql`create view`
    // ...
  ])
}

export function dropView(data: ViewData): Sql {
  return sql.join([
    sql`drop view`
    // ...
  ])
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
