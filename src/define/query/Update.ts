import {EV} from '../Expr'
import {Query, QueryData} from '../Query'
import {Table} from '../Table'

export class Update<Definition> extends Query<{rowsAffected: number}> {
  declare [Query.Data]: QueryData.Update

  set(set: Table.Update<Definition>): Update<Definition> {
    return new Update(this[Query.Data].with({set}))
  }

  where(...where: Array<EV<boolean>>): Update<Definition> {
    return new Update(this.addWhere(where))
  }

  take(limit: number | undefined): Update<Definition> {
    return new Update(this[Query.Data].with({limit}))
  }

  skip(offset: number | undefined): Update<Definition> {
    return new Update(this[Query.Data].with({offset}))
  }
}
