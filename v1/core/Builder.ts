import {getData, internalData, type HasTable} from './Internal.ts'
import type {QueryMeta} from './MetaData.ts'
import type {QueryData} from './Query.ts'
import type {SelectionInput} from './Selection.ts'
import type {Table, TableDefinition} from './Table.ts'
import {Create} from './query/Create.ts'
import {DeleteFrom} from './query/Delete.ts'
import {Drop} from './query/Drop.ts'
import {InsertInto} from './query/Insert.ts'
import type {WithSelection, WithoutSelection} from './query/Select.ts'
import {Select} from './query/Select.ts'
import {UpdateTable} from './query/Update.ts'

export class Builder<Meta extends QueryMeta> {
  readonly [internalData]: QueryData<Meta>

  constructor(data: QueryData<Meta>) {
    this[internalData] = data
  }

  create<Definition extends TableDefinition>(table: Table<Definition>) {
    return new Create<Meta>({...getData(this), table})
  }

  drop(table: HasTable) {
    return new Drop<Meta>({...getData(this), table})
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
        input,
        tables: [],
        nullable: []
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
        input,
        tables: [],
        nullable: []
      },
      distinct: true
    })
  }

  update<Definition extends TableDefinition>(table: Table<Definition>) {
    return new UpdateTable<Definition, Meta>({...getData(this), table})
  }

  insert<Definition extends TableDefinition>(into: Table<Definition>) {
    return new InsertInto<Definition, Meta>({...getData(this), into})
  }

  delete(from: HasTable) {
    return new DeleteFrom<Meta>({...getData(this), from})
  }
}
