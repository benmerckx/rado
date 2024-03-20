import type {Driver} from './Driver.ts'
import {getResolver, meta, type HasQuery, type HasResolver} from './Meta.ts'
import type {QueryMode, QueryResolver} from './Query.ts'
import type {SelectionInput} from './Selection.ts'
import type {Table, TableDefinition} from './Table.ts'
import {Create} from './query/Create.ts'
import {InsertInto} from './query/Insert.ts'
import {WithSelection} from './query/Select.ts'
import {Update} from './query/Update.ts'

export class Database<Mode extends QueryMode> implements HasResolver<Mode> {
  [meta.resolver]: QueryResolver<Mode>

  constructor(driver: Driver<Mode>) {
    function exec(method: 'all' | 'get' | 'run', query: HasQuery) {
      const [sql, params] = driver.emitter.emit(query)
      const stmt = driver.prepare(sql)
      const res = stmt[method](params)
      stmt.free()
      return res
    }
    this[meta.resolver] = {
      all: exec.bind(null, 'all'),
      get: exec.bind(null, 'get'),
      run: exec.bind(null, 'run')
    }
  }

  create<Definition extends TableDefinition>(
    table: Table<Definition>
  ): Create<Mode> {
    return new Create({resolver: getResolver(this), table})
  }

  select<T>(selection: SelectionInput): WithSelection<T, Mode> {
    return new WithSelection({resolver: getResolver(this), selection})
  }

  selectDistinct<T>(selection: SelectionInput): WithSelection<T, Mode> {
    return new WithSelection({
      resolver: getResolver(this),
      selection,
      distinct: true
    })
  }

  update<Definition extends TableDefinition>(
    table: Table<Definition>
  ): Update<Definition, Mode> {
    return new Update({resolver: getResolver(this), table})
  }

  insert<Definition extends TableDefinition>(
    into: Table<Definition>
  ): InsertInto<Definition, Mode> {
    return new InsertInto({resolver: getResolver(this), into})
  }
}
