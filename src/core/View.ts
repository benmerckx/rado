import {
  type HasQuery,
  type HasSql,
  type HasTarget,
  getData,
  internalData
} from './Internal.ts'
import type {QueryMeta} from './MetaData.ts'
import type {QueryData} from './Queries.ts'
import type {TableDefinition, TableFields} from './Table.ts'
import {virtualQuery} from './Virtual.ts'
import type {UnionBase} from './query/Select.ts'

interface ViewData {
  name: string
  as?: HasSql | HasQuery
}

export type VirtualView<Input> = Input & HasTarget & HasQuery

export class View<Input, Meta extends QueryMeta> {
  readonly [internalData]: QueryData<Meta> & ViewData

  constructor(data: ViewData) {
    this[internalData] = data
  }

  as<Input>(query: UnionBase<Input, Meta>): VirtualView<Input>
  as<Input>(query: HasSql<Input>): VirtualView<Input>
  as(query: HasSql | UnionBase<unknown>): VirtualView<Input> {
    const {name} = getData(this)
    return virtualQuery<Input>(name, query)
  }
}

export function view(name: string): View<unknown, QueryMeta>
export function view<Definition extends TableDefinition>(
  name: string,
  fields: Definition
): View<TableFields<Definition>, QueryMeta>
export function view(
  name: string,
  fields?: TableDefinition,
  schemaName?: string
) {
  return new View({name})
}
