import {EV, Expr, ExprData} from '../Expr.js'
import {Index} from '../Index.js'
import {Query, QueryData} from '../Query.js'
import {Table, TableData, createTable} from '../Table.js'
import {Target} from '../Target.js'
import {CreateTable} from './CreateTable.js'
import {Delete} from './Delete.js'
import {Insert, InsertInto, InsertOne} from './Insert.js'
import {Select} from './Select.js'
import {Update} from './Update.js'

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

  indexedBy(index: Index) {
    throw 'todo'
  }

  create() {
    return new CreateTable(this.table)
  }

  insert(query: Select<Table.Insert<Definition>>): Insert
  insert(rows: Array<Table.Insert<Definition>>): Insert
  insert(row: Table.Insert<Definition>): InsertOne<Table.Select<Definition>>
  insert(input: any) {
    if (input instanceof Select) {
      return this.insertSelect(input)
    } else if (Array.isArray(input)) {
      return this.insertAll(input)
    } else {
      return this.insertOne(input)
    }
  }

  insertSelect(query: Select<Table.Insert<Definition>>) {
    return new Insert(
      new QueryData.Insert({into: this.table, select: query[Query.Data]})
    )
  }

  insertOne(record: Table.Insert<Definition>) {
    return new InsertOne<Table.Select<Definition>>(
      new QueryData.Insert({
        into: this.table,
        data: [record],
        selection: new ExprData.Row(new Target.Table(this.table)),
        singleResult: true
      })
    )
  }

  insertAll(data: Array<Table.Insert<Definition>>) {
    return new InsertInto<Definition>(this.table).values(...data)
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
