import {
  getData,
  getQuery,
  getSelection,
  internalData,
  internalQuery,
  internalTarget,
  type HasQuery,
  type HasSql,
  type HasTarget
} from './Internal.ts'
import type {IsPostgres, QueryMeta} from './MetaData.ts'
import type {QueryData} from './Query.ts'
import {selection, type SelectionInput} from './Selection.ts'
import {sql} from './Sql.ts'
import type {Table, TableDefinition} from './Table.ts'
import {DeleteFrom} from './query/Delete.ts'
import {InsertInto} from './query/Insert.ts'
import type {
  SelectBase,
  WithSelection,
  WithoutSelection
} from './query/Select.ts'
import {Select} from './query/Select.ts'
import type {UnionBase} from './query/Union.ts'
import {UpdateTable} from './query/Update.ts'

class BuilderBase<Meta extends QueryMeta> {
  readonly [internalData]: QueryData<Meta>

  constructor(data: QueryData<Meta> = {}) {
    this[internalData] = data
  }

  select(): WithoutSelection<Meta>
  select<Input extends SelectionInput>(
    selection: Input
  ): WithSelection<Input, Meta>
  select(input?: SelectionInput): any {
    return new Select<unknown, Meta>({
      ...getData(this),
      select: {
        type: input ? 'selection' : 'allFrom',
        selection: input && selection(input),
        tables: []
      }
    })
  }

  selectDistinct(): WithoutSelection<Meta>
  selectDistinct<Input extends SelectionInput>(
    selection: Input
  ): WithSelection<Input, Meta>
  selectDistinct(input?: SelectionInput): any {
    return new Select({
      ...getData(this),
      select: {
        type: input ? 'selection' : 'allFrom',
        selection: input && selection(input),
        tables: []
      },
      distinct: true
    })
  }

  selectDistinctOn(
    this: Builder<IsPostgres>,
    columns: Array<HasSql>
  ): WithoutSelection<Meta>
  selectDistinctOn<Input extends SelectionInput>(
    this: Builder<IsPostgres>,
    columns: Array<HasSql>,
    selection: Input
  ): WithSelection<Input, Meta>
  selectDistinctOn(columns: any, input?: any): any {
    return new Select({
      ...getData(this),
      select: {
        type: input ? 'selection' : 'allFrom',
        selection: input && selection(input),
        tables: []
      },
      distinctOn: columns
    })
  }

  update<Definition extends TableDefinition>(
    table: Table<Definition>
  ): UpdateTable<Definition, Meta> {
    return new UpdateTable<Definition, Meta>({...getData(this), table})
  }

  insert<Definition extends TableDefinition>(
    into: Table<Definition>
  ): InsertInto<Definition, Meta> {
    return new InsertInto<Definition, Meta>({...getData(this), into})
  }

  delete<Definition extends TableDefinition>(
    from: Table<Definition>
  ): DeleteFrom<Definition, Meta> {
    return new DeleteFrom<Definition, Meta>({...getData(this), from})
  }
}

export type CTE<Input = unknown> = Input & HasTarget & HasQuery

export class Builder<Meta extends QueryMeta> extends BuilderBase<Meta> {
  $withRecursive(cteName: string): {
    as<Input extends SelectionInput>(query: UnionBase<Input, Meta>): CTE<Input>
  } {
    return {
      as<Input extends SelectionInput>(
        query: SelectBase<Input, Meta>
      ): CTE<Input> {
        const fields = getSelection(query).makeVirtual(cteName)
        return Object.assign(<any>fields, {
          [internalTarget]: sql.identifier(cteName),
          [internalQuery]: getQuery(query)
        })
      }
    }
  }

  $with(cteName: string): {
    as<Input extends SelectionInput>(query: SelectBase<Input, Meta>): CTE<Input>
  } {
    return {
      as<Input extends SelectionInput>(
        query: SelectBase<Input, Meta>
      ): CTE<Input> {
        const fields = getSelection(query).makeVirtual(cteName)
        return Object.assign(<any>fields, {
          [internalTarget]: sql.identifier(cteName),
          [internalQuery]: getQuery(query)
        })
      }
    }
  }

  with(...cte: Array<CTE>): BuilderBase<Meta> {
    return new BuilderBase({
      ...getData(this),
      cte
    })
  }
}
