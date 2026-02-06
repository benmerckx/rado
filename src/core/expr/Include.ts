import type {DriverSpecs} from '../Driver.ts'
import {type HasValue, get, internal} from '../Internal.ts'
import type {QueryMeta} from '../MetaData.ts'
import type {QueryData} from '../Queries.ts'
import type {MapRowContext, RowOfRecord} from '../Selection.ts'
import {type Sql, sql} from '../Sql.ts'
import type {CompoundSelect, SelectQuery} from '../query/Query.ts'
import {
  type SelectBase,
  querySelection,
  selectQuery
} from '../query/Select.ts'
import {jsonAggregateArray, jsonArray} from './Json.ts'

export type IncludeQuery = Omit<SelectQuery, 'select'> & {
  select?: SelectQuery['select'] | CompoundSelect
  first: boolean
}

export class Include<Result, Meta extends QueryMeta = QueryMeta>
  implements HasValue<Result>
{
  private declare brand: [Result]
  readonly [internal]: QueryData & IncludeQuery & {value: Sql<Result>}

  constructor(data: QueryData & IncludeQuery) {
    const mapFromDriverValue = this.#mapFromDriverValue
    this[internal] = {
      ...data,
      get value() {
        return includeQuery(this as IncludeQuery).mapWith<Result>({
          mapFromDriverValue
        })
      }
    }
  }

  #mapFromDriverValue = (value: any, specs: DriverSpecs): any => {
    const query = get(this)
    const parsed = specs.parsesJson ? value : JSON.parse(value)
    const selected = querySelection(query)
    if (query.first) {
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
}

export function include<Input, Meta extends QueryMeta>(
  select: SelectBase<Input, Meta>
): Include<Array<RowOfRecord<Input>>, Meta> {
  return new Include({...get(select), first: false})
}

export namespace include {
  export function one<Input, Meta extends QueryMeta>(
    select: SelectBase<Input, Meta>
  ): Include<RowOfRecord<Input> | null, Meta> {
    return new Include({
      ...get(select),
      first: true
    })
  }
}

export function includeQuery(query: IncludeQuery): Sql {
  const {first, limit, offset, orderBy} = query
  const wrapQuery = Boolean(limit || offset || orderBy)
  const innerQuery = selectQuery(query)
  const inner = wrapQuery ? sql`select * from (${innerQuery})` : innerQuery
  const fields = querySelection(query).fieldNames()
  const subject = jsonArray(
    ...fields.map(name => sql`_.${sql.identifier(name)}`)
  )
  return sql`(select ${
    first ? subject : jsonAggregateArray(subject)
  } from (${inner}) as _)`
}
