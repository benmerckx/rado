import {Driver} from './Driver.ts'
import {HasQuery} from './Meta.ts'
import {QueryMode, QueryResolver} from './Query.ts'
import {SelectionInput} from './Selection.ts'
import {Table, TableDefinition} from './Table.ts'
import {Create} from './query/Create.ts'
import {InsertInto} from './query/Insert.ts'
import {Select} from './query/Select.ts'
import {Update} from './query/Update.ts'

export class Database<Mode extends QueryMode> {
  #resolver: QueryResolver

  constructor(driver: Driver<Mode>) {
    this.#resolver = {
      all: (query: HasQuery) => {
        const [sql, params] = driver.emitter.emit(query)
        const stmt = driver.prepare(sql)
        return stmt.all(params)
      },
      get: (query: HasQuery) => {
        const [sql, params] = driver.emitter.emit(query)
        const stmt = driver.prepare(sql)
        return stmt.get(params)
      },
      run: (query: HasQuery) => {
        const [sql, params] = driver.emitter.emit(query)
        const stmt = driver.prepare(sql)
        return stmt.run(params)
      }
    }
  }

  create<Definition extends TableDefinition>(
    table: Table<Definition>
  ): Create<Mode> {
    return new Create({resolver: this.#resolver, table})
  }

  select<T>(selection: SelectionInput): Select<T, Mode> {
    return new Select({resolver: this.#resolver, selection})
  }

  selectDistinct<T>(selection: SelectionInput): Select<T, Mode> {
    return new Select({resolver: this.#resolver, selection, distinct: true})
  }

  update<Definition extends TableDefinition>(
    table: Table<Definition>
  ): Update<Definition, Mode> {
    return new Update({resolver: this.#resolver, table})
  }

  insert<Definition extends TableDefinition>(
    into: Table<Definition>
  ): InsertInto<Definition, Mode> {
    return new InsertInto({resolver: this.#resolver, into})
  }
}
