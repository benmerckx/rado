import {EV} from '../Expr'
import {Query, QueryData} from '../Query'

export class Delete extends Query<{rowsAffected: number}> {
  declare [Query.Data]: QueryData.Delete

  constructor(query: QueryData.Delete) {
    super(query)
  }

  where(...where: Array<EV<boolean>>): Delete {
    return new Delete(this.addWhere(where))
  }

  take(limit: number | undefined): Delete {
    return new Delete(this[Query.Data].with({limit}))
  }

  skip(offset: number | undefined): Delete {
    return new Delete(this[Query.Data].with({offset}))
  }
}
