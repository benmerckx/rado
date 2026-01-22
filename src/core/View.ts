import {
  type HasQuery,
  type HasSql,
  type HasTarget,
  getData,
  getQuery,
  getSelection,
  hasSql,
  internalData,
  internalQuery
} from './Internal.ts'
import type {QueryMeta} from './MetaData.ts'
import type {QueryData} from './Queries.ts'
import {Field} from './expr/Field.ts'
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
    if (hasSql(query))
      return new Proxy({[internalQuery]: query} as VirtualView<Input>, {
        get(_, property) {
          return new Field(name, property as string)
        }
      })
    const fields = getSelection(query).makeVirtual<Input>(name)
    return Object.assign(fields, {
      [internalQuery]: getQuery(query)
    })
  }
}

export function view(name: string) {
  return new View({name})
}
