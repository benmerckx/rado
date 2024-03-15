import {ContainsSql, sql} from './Sql.ts'

export class Query extends ContainsSql {
  toSubquery() {
    return sql`(${this})`
  }
}
