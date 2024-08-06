import {
  getData,
  internalData,
  internalSql,
  type HasData,
  type HasSql
} from '../Internal.ts'
import type {QueryMeta} from '../MetaData.ts'
import type {MapRowContext, RowOfRecord} from '../Selection.ts'
import {sql, type Sql} from '../Sql.ts'
import type {Select, SelectData} from '../query/Select.ts'

export interface IncludeData<Meta extends QueryMeta> extends SelectData<Meta> {
  first: boolean
}

export class Include<Result, Meta extends QueryMeta = QueryMeta>
  implements HasData<IncludeData<Meta>>, HasSql<Result>
{
  private declare brand: [Result]
  readonly [internalData]: IncludeData<Meta>

  constructor(data: IncludeData<Meta>) {
    this[internalData] = data
  }

  get [internalSql](): Sql<Result> {
    const data = getData(this)
    const selection = data.select.selection!
    return sql.chunk('emitInclude', data).mapWith({
      mapFromDriverValue(value: any, specs) {
        const rows: Array<Array<unknown>> = specs.parsesJson
          ? value
          : JSON.parse(value)
        const ctx: MapRowContext = {
          values: undefined!,
          index: 0,
          specs
        }
        for (let i = 0; i < rows.length; i++) {
          ctx.values = rows[i]
          ctx.index = 0
          rows[i] = selection.mapRow(ctx) as Array<unknown>
        }
        return (data.first ? rows[0] : rows) as Result
      }
    })
  }
}

export function include<Input, Meta extends QueryMeta>(
  select: Select<Input, Meta>
) {
  return new Include<Array<RowOfRecord<Input>>, Meta>({
    ...getData(select),
    first: false
  })
}

export namespace include {
  export function one<Input, Meta extends QueryMeta>(
    select: Select<Input, Meta>
  ) {
    return new Include<RowOfRecord<Input>, Meta>({
      ...getData(select),
      first: true
    })
  }
}
