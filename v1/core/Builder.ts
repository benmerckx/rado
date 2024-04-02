import {type HasTable, getData, internalData} from './Internal.ts'
import type {QueryData, QueryMeta} from './Query.ts'
import type {SelectionInput} from './Selection.ts'
import type {Table, TableDefinition} from './Table.ts'
import {Create} from './query/Create.ts'
import {DeleteFrom} from './query/Delete.ts'
import {InsertInto} from './query/Insert.ts'
import {Select, SelectionType} from './query/Select.ts'
import {UpdateTable} from './query/Update.ts'

export class Builder<Meta extends QueryMeta> {
  readonly [internalData]: QueryData<Meta>

  constructor(data: QueryData<Meta>) {
    this[internalData] = data
  }

  create<Definition extends TableDefinition>(
    table: Table<Definition>
  ): Create<Meta> {
    return new Create<Meta>({...getData(this), table})
  }

  select(): Select.WithoutSelection<Meta>
  select<Input extends SelectionInput>(
    selection: Input
  ): Select.WithSelection<Input, Meta>
  select(input?: SelectionInput): any {
    return new Select<unknown, Meta>({
      ...getData(this),
      select: {
        type: input ? SelectionType.Selection : SelectionType.AllFrom,
        input
      }
    })
  }

  selectDistinct(): Select.WithoutSelection<Meta>
  selectDistinct<Input extends SelectionInput>(
    selection: Input
  ): Select.WithSelection<Input, Meta>
  selectDistinct(input?: SelectionInput): any {
    return new Select({
      ...getData(this),
      select: {
        type: input ? SelectionType.Selection : SelectionType.AllFrom,
        input
      },
      distinct: true
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

  delete(from: HasTable): DeleteFrom<Meta> {
    return new DeleteFrom({...getData(this), from})
  }
}
