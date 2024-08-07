import type {DriverSpecs} from '../Driver.ts'
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
import type {Select, SelectBase, SelectData} from '../query/Select.ts'

export interface IncludeData<Meta extends QueryMeta = QueryMeta>
  extends SelectData<Meta> {
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

  #mapFromDriverValue = (value: any, specs: DriverSpecs): any => {
    const {select, first} = getData(this)
    const selection = select.selection!
    const parsed = specs.parsesJson ? value : JSON.parse(value)
    if (first)
      return parsed ? selection.mapRow({values: parsed, index: 0, specs}) : null
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
      rows[i] = selection.mapRow(ctx) as Array<unknown>
    }
    return rows ?? []
  }

  get [internalSql](): Sql<Result> {
    return sql.chunk('emitInclude', getData(this)).mapWith<Result>({
      mapFromDriverValue: this.#mapFromDriverValue
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
    select: SelectBase<Input, Meta>
  ) {
    return new Include<RowOfRecord<Input> | null, Meta>({
      ...(getData(select) as SelectData<Meta>),
      first: true
    })
  }
}
