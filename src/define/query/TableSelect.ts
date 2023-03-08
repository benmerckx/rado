import {EV, Expr, ExprData} from '../Expr'
import {Query, QueryData} from '../Query'
import {Table, TableData, createTable} from '../Table'
import {Target} from '../Target'
import {CreateTable} from './CreateTable'
import {Delete} from './Delete'
import {Insert, Inserted} from './Insert'
import {Select} from './Select'
import {Update} from './Update'

export class TableSelect<Definition> extends Select<Table.Select<Definition>> {
  declare [Query.Data]: QueryData.Select

  constructor(protected table: TableData, conditions: Array<EV<boolean>> = []) {
    const target = new Target.Table(table)
    super(
      new QueryData.Select({
        from: target,
        selection: new ExprData.Row(target),
        where: Expr.and(...conditions)[Expr.Data]
      })
    )
  }

  as(alias: string): Table<Definition> {
    return createTable({...this.table, alias})
  }

  create() {
    return new CreateTable(this.table)
  }

  insertSelect(query: Select<Table.Insert<Definition>>) {
    return new Inserted(
      new QueryData.Insert({into: this.table, select: query[Query.Data]})
    )
  }

  insertOne(record: Table.Insert<Definition>) {
    return new Query<Table.Select<Definition>>(
      new QueryData.Insert({
        into: this.table,
        data: [record],
        selection: new ExprData.Row(new Target.Table(this.table)),
        singleResult: true
      })
    )
  }

  insertAll(data: Array<Table.Insert<Definition>>) {
    return new Insert<Definition>(this.table).values(...data)
  }

  set(data: Table.Update<Definition>) {
    return new Update<Definition>(
      new QueryData.Update({
        table: this.table,
        where: this[Query.Data].where
      })
    ).set(data)
  }

  delete() {
    return new Delete(
      new QueryData.Delete({
        table: this.table,
        where: this[Query.Data].where
      })
    )
  }

  get(name: string): Expr<any> {
    return new Expr(
      new ExprData.Field(new ExprData.Row(new Target.Table(this.table)), name)
    )
  }
}
