import {
  getData,
  internalData,
  internalSql,
  type HasData,
  type HasSql
} from '../Internal.ts'
import type {QueryMeta} from '../MetaData.ts'
import type {MapRowContext} from '../Selection.ts'
import {sql, type Sql} from '../Sql.ts'
import type {Select, SelectData} from '../query/Select.ts'

// Todo: distinguish all vs one in type and mapping

export class Include<Input, Meta extends QueryMeta = QueryMeta>
  implements HasData<SelectData<Meta>>, HasSql
{
  private declare brand: [Input]
  readonly [internalData]: SelectData<Meta>

  constructor(data: SelectData<Meta>) {
    this[internalData] = data
  }

  get [internalSql](): Sql {
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
        return rows
      }
    })
  }
}

export function include<Input, Meta extends QueryMeta>(
  select: Select<Input, Meta>
) {
  return new Include<Input, Meta>(getData(select))
}

export namespace include {
  export function one<Input, Meta extends QueryMeta>(
    select: Select<Input, Meta>
  ) {
    return new Include<Input, Meta>(getData(select))
  }
}
