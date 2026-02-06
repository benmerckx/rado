import {
  type HasQuery,
  type HasValue,
  get,
  internal
} from '../Internal.ts'
import type {IsPostgres, IsSqlite, QueryMeta} from '../MetaData.ts'
import {type QueryData, SingleQuery} from '../Queries.ts'
import {
  type Selection,
  type SelectionInput,
  type SelectionRow,
  selection
} from '../Selection.ts'
import {type Sql, sql} from '../Sql.ts'
import type {TableDefinition, TableFields, TableUpdate} from '../Table.ts'
import {and} from '../expr/Conditions.ts'
import {type Input as UserInput, mapToColumn} from '../expr/Input.ts'
import {formatCTE} from './CTE.ts'
import type {UpdateQuery} from './Query.ts'
import {formatModifiers} from './Shared.ts'

export class Update<Input, Meta extends QueryMeta = QueryMeta>
  extends SingleQuery<Array<SelectionRow<Input>>, Meta>
  implements HasQuery<Array<SelectionRow<Input>>>
{
  readonly [internal]: Omit<QueryData, 'query' | 'selection'> &
    UpdateQuery & {
      query: Sql<Array<SelectionRow<Input>>>
      selection?: Selection
    }

  constructor(data: QueryData & UpdateQuery) {
    super(data)
    const entry = {
      ...data,
      selection: data.returning ? selection(data.returning) : undefined
    } as Omit<QueryData, 'query' | 'selection'> &
      UpdateQuery & {
        query: Sql<Array<SelectionRow<Input>>>
        selection?: Selection
      }
    Object.defineProperty(entry, 'query', {
      enumerable: false,
      get() {
        return updateQuery(this as UpdateQuery) as Sql<Array<SelectionRow<Input>>>
      }
    })
    this[internal] = entry
  }

  limit(limit: UserInput<number>): Update<Input, Meta> {
    return new Update({...get(this), limit})
  }

  offset(offset: UserInput<number>): Update<Input, Meta> {
    return new Update({...get(this), offset})
  }

  orderBy(...orderBy: Array<HasValue>): Update<Input, Meta> {
    return new Update({...get(this), orderBy})
  }
}

export class UpdateTable<
  Definition extends TableDefinition,
  Meta extends QueryMeta
> extends Update<void, Meta> {
  set(set: TableUpdate<Definition>): UpdateTable<Definition, Meta> {
    return new UpdateTable<Definition, Meta>({...get(this), set})
  }

  where(
    ...where: Array<HasValue<boolean> | undefined>
  ): UpdateTable<Definition, Meta> {
    return new UpdateTable<Definition, Meta>({
      ...get(this),
      where: and(...where)
    })
  }

  returning(
    this: UpdateTable<Definition, IsPostgres | IsSqlite>
  ): Update<TableFields<Definition>, Meta>
  returning<Input extends SelectionInput>(
    this: UpdateTable<Definition, IsPostgres | IsSqlite>,
    returning?: Input
  ): Update<Input, Meta>
  returning(returning?: SelectionInput) {
    const data = get(this)
    return new Update({...data, returning: returning ?? data.update})
  }
}

export function updateQuery(query: UpdateQuery): Sql {
  const {update: table, set: values, where, returning} = query
  const tableApi = get(table).table!
  if (!values) throw new Error('Update values are required')
  const set = sql.join(
    Object.entries(tableApi.columns).map(([key, column]) => {
      const columnApi = get(column)
      const {name, $onUpdate} = columnApi
      let expr: unknown
      if (!(key in values)) {
        if ($onUpdate) expr = $onUpdate()
        else return
      } else {
        expr = mapToColumn(columnApi, values[key])
      }
      const fieldName = name ?? key
      return sql`${sql.identifier(fieldName)} = ${expr}`
    }),
    sql`, `
  )
  return sql
    .query(
      formatCTE(query),
      {
        update: sql.identifier(tableApi.name),
        set,
        where,
        returning: returning && selection(returning)
      },
      formatModifiers(query)
    )
    .inlineFields(false)
}
