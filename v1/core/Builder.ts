import {getData, internal, type HasTable} from './Internal.ts'
import type {QueryData, QueryMeta} from './Query.ts'
import type {SelectionInput} from './Selection.ts'
import type {Table, TableDefinition} from './Table.ts'
import {Create} from './query/Create.ts'
import {DeleteFrom} from './query/Delete.ts'
import {InsertInto} from './query/Insert.ts'
import {
  Selected,
  type WithSelection,
  type WithoutSelection
} from './query/Select.ts'
import {UpdateTable} from './query/Update.ts'

export class Builder<Meta extends QueryMeta> {
  readonly [internal.data]: QueryData<Meta>

  constructor(data: QueryData<Meta>) {
    this[internal.data] = data
  }

  create<Definition extends TableDefinition>(
    table: Table<Definition>
  ): Create<Meta> {
    return new Create({...getData(this), table})
  }

  select(): WithoutSelection<Meta>
  select<Input extends SelectionInput>(
    selection: Input
  ): WithSelection<Input, Meta>
  select(selection?: SelectionInput) {
    return new Selected({...getData(this), selection})
  }

  selectDistinct(): WithoutSelection<Meta>
  selectDistinct<Input extends SelectionInput>(
    selection: Input
  ): WithSelection<Input, Meta>
  selectDistinct(selection?: SelectionInput) {
    return new Selected({...getData(this), selection, distinct: true})
  }

  update<Definition extends TableDefinition>(
    table: Table<Definition>
  ): UpdateTable<Definition, Meta> {
    return new UpdateTable({...getData(this), table})
  }

  insert<Definition extends TableDefinition>(
    into: Table<Definition>
  ): InsertInto<Definition, Meta> {
    return new InsertInto({...getData(this), into})
  }

  delete(from: HasTable): DeleteFrom<Meta> {
    return new DeleteFrom({...getData(this), from})
  }
}
