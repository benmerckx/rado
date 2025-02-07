import type {DriverSpecs} from '../Driver.ts'
import {type HasSql, getData, internalData, internalSql} from '../Internal.ts'
import type {QueryMeta} from '../MetaData.ts'
import type {QueryData} from '../Query.ts'
import {type MapRowContext, type RowOfRecord, selection} from '../Selection.ts'
import {type Sql, sql} from '../Sql.ts'
import type {SelectQuery} from '../query/Query.ts'
import {type Select, type SelectBase, selectQuery} from '../query/Select.ts'
import {jsonAggregateArray, jsonArray} from './Json.ts'

export type IncludeQuery = SelectQuery & {
  first: boolean
}

export class Include<Result, Meta extends QueryMeta = QueryMeta>
  implements HasSql<Result>
{
  private declare brand: [Result]
  readonly [internalData]: QueryData<Meta> & IncludeQuery

  constructor(data: QueryData<Meta> & IncludeQuery) {
    this[internalData] = data
  }

  #mapFromDriverValue = (value: any, specs: DriverSpecs): any => {
    const {select, first} = getData(this)
    const parsed = specs.parsesJson ? value : JSON.parse(value)
    if (!select) throw new Error('Include has no select')
    const selected = selection(select)
    if (first) {
      const result = parsed
        ? selected.mapRow({values: parsed, index: 0, specs})
        : null
      return result
    }
    if (!parsed) return []
    const rows: Array<Array<unknown>> = parsed
    const ctx: MapRowContext = {
      values: undefined!,
      index: 0,
      specs
    }
    for (let i = 0; i < rows.length; i++) {
      ctx.values = rows[i]
      ctx.index = 0
      rows[i] = selected.mapRow(ctx) as Array<unknown>
    }
    return rows ?? []
  }

  get [internalSql](): Sql<Result> {
    return includeQuery(getData(this)).mapWith<Result>({
      mapFromDriverValue: this.#mapFromDriverValue
    })
  }
}

export function include<Input, Meta extends QueryMeta>(
  select: Select<Input, Meta>
): Include<Array<RowOfRecord<Input>>, Meta> {
  return new Include({...getData(select), first: false})
}

export namespace include {
  export function one<Input, Meta extends QueryMeta>(
    select: SelectBase<Input, Meta>
  ): Include<RowOfRecord<Input> | null, Meta> {
    return new Include({
      ...(getData(select) as QueryData<Meta> & SelectQuery),
      first: true
    })
  }
}

export function includeQuery(query: IncludeQuery) {
  const {first, select, limit, offset, orderBy} = query
  const wrapQuery = Boolean(limit || offset || orderBy)
  const innerQuery = selectQuery(query)
  const inner = wrapQuery ? sql`select * from (${innerQuery})` : innerQuery
  if (!select) throw new Error('No selection defined')
  const fields = selection(select).fieldNames()
  const subject = jsonArray(
    ...fields.map(name => sql`_.${sql.identifier(name)}`)
  )
  return sql`(select ${
    first ? subject : jsonAggregateArray(subject)
  } from (${inner}) as _)`
}
