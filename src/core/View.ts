import {
  type HasQuery,
  type HasSql,
  getData,
  getQuery,
  getSelection,
  getSql,
  internalData
} from './Internal.ts'
import type {QueryMeta} from './MetaData.ts'
import {type TableDefinition, type TableFields, tableFields} from './Table.ts'
import {
  type VirtualQuery,
  type VirtualTarget,
  virtualQuery,
  virtualTarget
} from './Virtual.ts'
import type {UnionBase} from './query/Select.ts'

interface ViewData {
  name: string
  columns?: TableDefinition
  schemaName?: string
  as?: HasSql | HasQuery
}

export class View {
  readonly [internalData]: ViewData

  constructor(data: ViewData) {
    this[internalData] = data
  }
}

export class QueryView extends View {
  as<Input, Meta extends QueryMeta>(
    query: UnionBase<Input, Meta>
  ): VirtualQuery<Input> {
    const {name} = getData(this)
    return virtualQuery<Input>(
      name,
      getSelection(query).input as Input,
      getQuery(query)
    )
  }
}

export class DefinedView<Definition extends TableDefinition> extends View {
  existing(): VirtualTarget<TableFields<Definition>> {
    const {name, columns} = getData(this)
    const fields = tableFields(name, columns!) as TableFields<Definition>
    return virtualTarget(name, fields)
  }

  as(query: HasSql): VirtualQuery<TableFields<Definition>> {
    const {name, columns} = getData(this)
    const fields = tableFields(name, columns!) as TableFields<Definition>
    return virtualQuery(name, fields, getSql(query))
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
