import type {DriverSpecs} from '../Driver.ts'
import {type HasSql, getData, internalData, internalSql} from '../Internal.ts'
import type {QueryMeta} from '../MetaData.ts'
import type {QueryData} from '../Queries.ts'
import type {SelectQuery} from '../query/Query.ts'
import {
  type Select,
  type SelectBase,
  querySelection,
  selectQuery
} from '../query/Select.ts'
import type {MapRowContext, SelectionRow} from '../Selection.ts'
import {type Sql, type TargetScope, sql} from '../Sql.ts'
import {jsonAggregateArray, jsonArray} from './Json.ts'

export type IncludeQuery = SelectQuery & {
  first: boolean
}

export class Include<
  Result,
  Meta extends QueryMeta = QueryMeta
> implements HasSql<Result> {
  declare private brand: [Result]
  readonly [internalData]: QueryData<Meta> & IncludeQuery
  readonly #targetScope?: TargetScope

  constructor(data: QueryData<Meta> & IncludeQuery, targetScope?: TargetScope) {
    this[internalData] = data
    this.#targetScope = targetScope
  }

  #mapFromDriverValue = (value: any, specs: DriverSpecs): any => {
    const query = getData(this)
    const parsed = specs.parsesJson ? value : JSON.parse(value)
    const selected = querySelection(query, this.#targetScope)
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

  get [internalSql](): Sql<Result> {
    return includeQuery(getData(this), this.#targetScope).mapWith<Result>({
      mapFromDriverValue: this.#mapFromDriverValue
    })
  }
}

export function include<Input, Meta extends QueryMeta>(
  select: Select<Input, Meta>,
  targetScope?: TargetScope
): Include<Array<SelectionRow<Input>>, Meta> {
  return new Include({...getData(select), first: false}, targetScope)
}

export namespace include {
  export function one<Input, Meta extends QueryMeta>(
    select: SelectBase<Input, Meta>,
    targetScope?: TargetScope
  ): Include<SelectionRow<Input> | null, Meta> {
    return new Include(
      {
        ...(getData(select) as QueryData<Meta> & SelectQuery),
        first: true
      },
      targetScope
    )
  }
}

export function includeQuery(
  query: IncludeQuery,
  targetScope?: TargetScope
): Sql {
  const {first, limit, offset, orderBy} = query
  const wrapQuery = Boolean(limit || offset || orderBy)
  const innerQuery = selectQuery(query, targetScope)
  const orderedQuery =
    orderBy && limit === undefined
      ? sql.universal({
          mysql: sql`${innerQuery} limit ${sql.unsafe('18446744073709551615')}`,
          default: innerQuery
        })
      : innerQuery
  const inner = wrapQuery
    ? sql`select * from (${orderedQuery}) as __`
    : orderedQuery
  const fields = querySelection(query, targetScope).fieldNames()
  const subject = jsonArray(
    ...fields.map(name => sql`_.${sql.identifier(name)}`)
  )
  const result = sql`(select ${
    first ? subject : jsonAggregateArray(subject)
  } from (${inner}) as _)`
  return targetScope
    ? result.scopeTarget(targetScope.sourceName, targetScope.name)
    : result
}
