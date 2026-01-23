import {type HasQuery, type HasSql, getData, internalData} from './Internal.ts'
import type {QueryMeta} from './MetaData.ts'
import type {QueryData} from './Queries.ts'
import type {TableDefinition, TableFields} from './Table.ts'
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

export class View<Input, Meta extends QueryMeta> {
  readonly [internalData]: QueryData<Meta> & ViewData

  constructor(data: ViewData) {
    this[internalData] = data
  }

  existing(): VirtualTarget<Input> {
    const {name, columns} = getData(this)
    return virtualTarget(name, columns as Input)
  }

  as<Input>(query: UnionBase<Input, Meta>): VirtualQuery<Input>
  as<Input>(query: HasSql<Input>): VirtualQuery<Input>
  as(query: HasSql | UnionBase<unknown>): VirtualQuery<Input> {
    const {name} = getData(this)
    return virtualQuery<Input>(name, query)
  }
}

export function view(name: string): View<unknown, QueryMeta>
export function view<Definition extends TableDefinition>(
  name: string,
  columns: Definition,
  schemaName?: string
): View<TableFields<Definition>, QueryMeta>
export function view(
  name: string,
  columns?: TableDefinition,
  schemaName?: string
) {
  return new View({name, columns, schemaName})
}
