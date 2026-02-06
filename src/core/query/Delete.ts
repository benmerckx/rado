import {
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
import type {TableDefinition, TableFields} from '../Table.ts'
import {and} from '../expr/Conditions.ts'
import type {Input as UserInput} from '../expr/Input.ts'
import {formatCTE} from './CTE.ts'
import type {DeleteQuery} from './Query.ts'
import {formatModifiers} from './Shared.ts'

export class Delete<
  Input,
  Meta extends QueryMeta = QueryMeta
> extends SingleQuery<Array<SelectionRow<Input>>, Meta> {
  readonly [internal]: Omit<QueryData, 'query' | 'selection'> &
    DeleteQuery & {query: Sql<Array<SelectionRow<Input>>>; selection?: Selection}

  constructor(data: QueryData & DeleteQuery) {
    super(data)
    this[internal] = {
      ...data,
      get query() {
        return deleteQuery(this as DeleteQuery) as Sql<Array<SelectionRow<Input>>>
      },
      selection: data.returning ? selection(data.returning) : undefined
    }
  }

  limit(limit: UserInput<number>): Delete<Input, Meta> {
    return new Delete({...get(this), limit})
  }

  offset(offset: UserInput<number>): Delete<Input, Meta> {
    return new Delete({...get(this), offset})
  }

  orderBy(...orderBy: Array<HasValue>): Delete<Input, Meta> {
    return new Delete({...get(this), orderBy})
  }
}

export class DeleteFrom<
  Definition extends TableDefinition,
  Meta extends QueryMeta
> extends Delete<void, Meta> {
  where(
    ...where: Array<HasValue<boolean> | undefined>
  ): DeleteFrom<Definition, Meta> {
    return new DeleteFrom({...get(this), where: and(...where)})
  }
  returning(
    this: DeleteFrom<Definition, IsPostgres | IsSqlite>
  ): Delete<TableFields<Definition>, Meta>
  returning<Input extends SelectionInput>(
    this: DeleteFrom<Definition, IsPostgres | IsSqlite>,
    returning: Input
  ): Delete<Input, Meta>
  returning(returning?: SelectionInput) {
    const data = get(this)
    return new Delete({
      ...data,
      returning: returning ?? data.delete
    })
  }
}

export function deleteQuery(query: DeleteQuery): Sql {
  const {delete: from, where, returning} = query
  const table = get(from).table!
  return sql.query(
    formatCTE(query),
    {
      deleteFrom: sql.identifier(table.name),
      where,
      returning: returning && selection(returning)
    },
    formatModifiers(query)
  )
}
