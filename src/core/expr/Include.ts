import type {DriverSpecs} from '../Driver.ts'
import {
  type HasData,
  type HasSql,
  getData,
  internalData,
  internalSql
} from '../Internal.ts'
import type {QueryMeta} from '../MetaData.ts'
import type {MapRowContext, RowOfRecord} from '../Selection.ts'
import {type Sql, sql} from '../Sql.ts'
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
    const parsed = specs.parsesJson ? value : JSON.parse(value)
    if (first) {
      const result = parsed
        ? select!.mapRow({values: parsed, index: 0, specs})
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
      rows[i] = select!.mapRow(ctx) as Array<unknown>
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
): Include<Array<RowOfRecord<Input>>, Meta> {
  return new Include({...getData(select), first: false})
}

export namespace include {
  export function one<Input, Meta extends QueryMeta>(
    select: SelectBase<Input, Meta>
  ): Include<RowOfRecord<Input> | null, Meta> {
    return new Include({...(getData(select) as SelectData<Meta>), first: true})
  }
}
