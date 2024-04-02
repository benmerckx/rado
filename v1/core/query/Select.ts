import {type Expr, type Input, input} from '../Expr.ts'
import type {Field} from '../Field.ts'
import {
  type HasQuery,
  type HasSelection,
  type HasSql,
  type HasTable,
  getData,
  getQuery,
  getTable,
  hasQuery,
  hasTable,
  internalData,
  internalQuery,
  internalSelection
} from '../Internal.ts'
import {Query, QueryData, type QueryMeta} from '../Query.ts'
import {
  type Selection,
  type SelectionRecord,
  type SelectionRow,
  selection
} from '../Selection.ts'
import {type Sql, sql} from '../Sql.ts'
import type {Table, TableDefinition, TableRow} from '../Table.ts'
import type {Expand, Nullable} from '../Types.ts'
import {Union} from './Union.ts'

class SelectData<Meta extends QueryMeta> extends QueryData<Meta> {
  selectAll!: boolean
  // tables?: Record<string, HasTable>
  select?: Selection
  distinct?: boolean
  from?: HasSql
  subject?: HasSql
  where?: HasSql
  groupBy?: HasSql
  having?: HasSql
  orderBy?: HasSql
  limit?: HasSql
  offset?: HasSql
}

export class Select<Result, Meta extends QueryMeta>
  extends Query<Result, Meta>
  implements HasSelection, Select.Base<Result, Meta>
{
  readonly [internalData]: SelectData<Meta>

  constructor(data: SelectData<Meta>) {
    super(data)
    this[internalData] = data
  }

  from(target: HasQuery | Table) {
    const from = hasQuery(target)
      ? sql`(${getQuery(target).inlineFields(true)})`
      : getTable(target).from()
    const select =
      this[internalData].select ?? selection(hasTable(target) ? target : sql`*`)
    return new Select({
      ...getData(this),
      select,
      from
    })
  }

  #join(
    operator: Sql,
    right: HasTable,
    on: Expr<boolean>
  ): Select<Result, Meta> {
    const {from, selectAll, select} = getData(this)
    const rightTable = getTable(right)
    return new Select({
      ...getData(this),
      from: sql.join([from, operator, rightTable.from(), sql`on ${on}`])
    })
  }

  leftJoin(right: HasTable, on: Expr<boolean>): Select<Result, Meta> {
    return this.#join(sql`left join`, right, on)
  }

  rightJoin(right: HasTable, on: Expr<boolean>): Select<Result, Meta> {
    return this.#join(sql`right join`, right, on)
  }

  innerJoin(right: HasTable, on: Expr<boolean>): Select<Result, Meta> {
    return this.#join(sql`inner join`, right, on)
  }

  fullJoin(right: HasTable, on: Expr<boolean>): Select<Result, Meta> {
    return this.#join(sql`full join`, right, on)
  }

  where(where: Expr<boolean>): Select<Result, Meta> {
    return new Select({...getData(this), where})
  }

  groupBy(...exprs: Array<Expr>): Select<Result, Meta> {
    return new Select({
      ...getData(this),
      groupBy: sql.join(exprs, sql.unsafe(', '))
    })
  }

  having(having: Expr<boolean>): Select<Result, Meta> {
    return new Select({...getData(this), having})
  }

  orderBy(...exprs: Array<Expr>): Select<Result, Meta> {
    return new Select({
      ...getData(this),
      orderBy: sql.join(exprs, sql.unsafe(', '))
    })
  }

  limit(limit: Input<number>): Select<Result, Meta> {
    return new Select({...getData(this), limit: input(limit)})
  }

  offset(offset: Input<number>): Select<Result, Meta> {
    return new Select({
      ...getData(this),
      offset: input(offset)
    })
  }

  union(right: Select.Base<Result, Meta>): Union<Result, Meta> {
    return new Union({
      ...getData(this),
      left: this,
      operator: sql`union`,
      right
    })
  }

  unionAll(right: Select.Base<Result, Meta>): Union<Result, Meta> {
    return new Union({
      ...getData(this),
      left: this,
      operator: sql`union all`,
      right
    })
  }

  intersect(right: Select.Base<Result, Meta>): Union<Result, Meta> {
    return new Union({
      ...getData(this),
      left: this,
      operator: sql`intersect`,
      right
    })
  }

  except(right: Select.Base<Result, Meta>): Union<Result, Meta> {
    return new Union({
      ...getData(this),
      left: this,
      operator: sql`except`,
      right
    })
  }

  get [internalSelection]() {
    return getData(this).select!
  }

  get [internalQuery]() {
    const {
      select,
      distinct,
      from,
      where,
      groupBy,
      having,
      orderBy,
      limit,
      offset
    } = getData(this)
    if (!select) throw new Error('No selection defined')
    return sql.query({
      select: distinct ? sql`distinct ${select}` : select,
      from,
      where,
      'group by': groupBy,
      'order by': orderBy,
      having,
      limit,
      offset
    })
  }
}

export namespace Select {
  export interface Base<Result, Meta extends QueryMeta>
    extends Query<Result, Meta>,
      HasSelection {
    where(where: Expr<boolean>): Select<Result, Meta>
    groupBy(...exprs: Array<Expr>): Select<Result, Meta>
    having(having: Expr<boolean>): Select<Result, Meta>
    orderBy(...exprs: Array<Expr>): Select<Result, Meta>
    limit(limit: Input<number>): Select<Result, Meta>
    offset(offset: Input<number>): Select<Result, Meta>
    union(right: Base<Result, Meta>): Union<Result, Meta>
    unionAll(right: Base<Result, Meta>): Union<Result, Meta>
    intersect(right: Base<Result, Meta>): Union<Result, Meta>
    except(right: Base<Result, Meta>): Union<Result, Meta>
  }

  export interface WithoutSelection<Meta extends QueryMeta> {
    from<Definition extends TableDefinition, Name extends string>(
      from: Table<Definition, Name>
    ): AllFrom<TableRow<Definition>, Meta, Record<Name, TableRow<Definition>>>
  }

  export interface WithSelection<Input, Meta extends QueryMeta> {
    from<Definition extends TableDefinition, Name extends string>(
      from: Table<Definition, Name>
    ): SelectionFrom<Input, Meta>
  }

  export interface AllFrom<Result, Meta extends QueryMeta, Tables = Result>
    extends Base<Result, Meta> {
    leftJoin<Definition extends TableDefinition, Name extends string>(
      right: Table<Definition, Name>,
      on: Expr<boolean>
    ): AllFrom<Expand<Tables & Record<Name, TableRow<Definition> | null>>, Meta>
    rightJoin<Definition extends TableDefinition, Name extends string>(
      right: Table<Definition, Name>,
      on: Expr<boolean>
    ): AllFrom<
      Expand<Nullable<Tables> & Record<Name, TableRow<Definition>>>,
      Meta
    >
    innerJoin<Definition extends TableDefinition, Name extends string>(
      right: Table<Definition, Name>,
      on: Expr<boolean>
    ): AllFrom<Expand<Tables & Record<Name, TableRow<Definition>>>, Meta>
    fullJoin<Definition extends TableDefinition, Name extends string>(
      right: Table<Definition, Name>,
      on: Expr<boolean>
    ): AllFrom<
      Expand<Nullable<Tables> & Record<Name, TableRow<Definition> | null>>,
      Meta
    >
  }

  type MarkFieldsAsNullable<Input, Table extends string> = Expand<{
    [K in keyof Input]: Input[K] extends Field<infer T, Table>
      ? Expr<T | null>
      : Input[K] extends Record<string, Field<unknown, Table> | Sql<unknown>>
      ? Input[K] | null
      : Input[K] extends SelectionRecord
      ? MarkFieldsAsNullable<Input[K], Table>
      : Input[K]
  }>

  export interface SelectionFrom<Input, Meta extends QueryMeta>
    extends Base<SelectionRow<Input>, Meta> {
    leftJoin<Definition extends TableDefinition, Name extends string>(
      right: Table<Definition, Name>,
      on: Expr<boolean>
    ): SelectionFrom<MarkFieldsAsNullable<Input, Name>, Meta>
    rightJoin<Definition extends TableDefinition, Name extends string>(
      right: Table<Definition, Name>,
      on: Expr<boolean>
    ): SelectionFrom<Input, Meta>
    innerJoin<Definition extends TableDefinition, Name extends string>(
      right: Table<Definition, Name>,
      on: Expr<boolean>
    ): SelectionFrom<Input, Meta>
    fullJoin<Definition extends TableDefinition, Name extends string>(
      right: Table<Definition, Name>,
      on: Expr<boolean>
    ): SelectionFrom<Input, Meta>
  }
}
