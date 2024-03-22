import {input, type Expr, type Input} from '../Expr.ts'
import {
  getData,
  getQuery,
  getSelection,
  getTable,
  hasQuery,
  internal,
  type HasExpr,
  type HasQuery,
  type HasSelection,
  type HasTable
} from '../Internal.ts'
import {Query, QueryData, type QueryMeta} from '../Query.ts'
import {
  Selection,
  type SelectionInput,
  type SelectionRow
} from '../Selection.ts'
import {sql, type Sql} from '../Sql.ts'
import type {Table, TableDefinition, TableRow} from '../Table.ts'
import type {Expand, Nullable} from '../Types.ts'
import {Union} from './Union.ts'

class SelectData<Meta extends QueryMeta> extends QueryData<Meta> {
  selection?: SelectionInput
  distinct?: boolean
  from?: Sql
  subject?: Sql
  where?: HasExpr
  groupBy?: Sql
  having?: HasExpr
  orderBy?: Sql
  limit?: Sql
  offset?: Sql
}

export class Select<Result, Meta extends QueryMeta>
  extends Query<Result, Meta>
  implements HasSelection
{
  readonly [internal.data]: SelectData<Meta>

  constructor(data: SelectData<Meta>) {
    super(data)
    this[internal.data] = data
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

  get 0() {
    return this.limit(1)
  }

  union(
    right: Select<Result, Meta> | Union<Result, Meta>
  ): Union<Result, Meta> {
    return new Union({
      ...getData(this),
      left: this,
      operator: sql`union`,
      right
    })
  }

  unionAll(right: Select<Result, Meta>): Union<Result, Meta> {
    return new Union({
      ...getData(this),
      left: this,
      operator: sql`union all`,
      right
    })
  }

  intersect(right: Select<Result, Meta>): Union<Result, Meta> {
    return new Union({
      ...getData(this),
      left: this,
      operator: sql`intersect`,
      right
    })
  }

  except(right: Select<Result, Meta>): Union<Result, Meta> {
    return new Union({
      ...getData(this),
      left: this,
      operator: sql`except`,
      right
    })
  }

  get [internal.selection]() {
    const {selection} = getData(this)
    if (!selection) throw new Error('todo')
    return new Selection(selection)
  }

  get [internal.query]() {
    const {distinct, from, where, groupBy, having, orderBy, limit, offset} =
      getData(this)
    const select = getSelection(this).toSql()
    return sql.join([
      distinct ? sql`select distinct` : sql`select`,
      select,
      from && sql`from ${from}`,
      where && sql`where ${where}`,
      groupBy && sql`group by ${groupBy}`,
      having && sql`having ${having}`,
      orderBy && sql`order by ${orderBy}`,
      limit && sql`limit ${limit}`,
      offset && sql`offset ${offset}`
    ])
  }
}

class Joinable extends Select<unknown, QueryMeta> {
  #join(operator: Sql, right: HasTable, on: Expr<boolean>) {
    const rightTable = getTable(right)
    return new Joinable({
      ...getData(this),
      from: sql.join([
        this[internal.data].from,
        operator,
        sql.identifier(rightTable.alias ?? rightTable.name),
        sql`on ${on}`
      ])
    })
  }
  leftJoin(right: HasTable, on: Expr<boolean>) {
    return this.#join(sql`left join`, right, on)
  }
  rightJoin(right: HasTable, on: Expr<boolean>) {
    return this.#join(sql`right join`, right, on)
  }
  innerJoin(right: HasTable, on: Expr<boolean>) {
    return this.#join(sql`inner join`, right, on)
  }
  fullJoin(right: HasTable, on: Expr<boolean>) {
    return this.#join(sql`full join`, right, on)
  }
}

interface AllFrom<Result, Meta extends QueryMeta, Tables = Result>
  extends Select<Result, Meta> {
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

interface SelectionFrom<Result, Meta extends QueryMeta>
  extends Select<Result, Meta> {
  leftJoin<Definition extends TableDefinition, Name extends string>(
    right: Table<Definition, Name>,
    on: Expr<boolean>
  ): SelectionFrom<Result, Meta>
  rightJoin<Definition extends TableDefinition, Name extends string>(
    right: Table<Definition, Name>,
    on: Expr<boolean>
  ): SelectionFrom<Result, Meta>
  innerJoin<Definition extends TableDefinition, Name extends string>(
    right: Table<Definition, Name>,
    on: Expr<boolean>
  ): SelectionFrom<Result, Meta>
  fullJoin<Definition extends TableDefinition, Name extends string>(
    right: Table<Definition, Name>,
    on: Expr<boolean>
  ): SelectionFrom<Result, Meta>
}

export class WithSelection<Result, Meta extends QueryMeta> extends Select<
  Result,
  Meta
> {
  from<Definition extends TableDefinition, Name extends string>(
    this: WithSelection<undefined, Meta>,
    from: Table<Definition, Name>
  ): AllFrom<TableRow<Definition>, Meta, Record<Name, TableRow<Definition>>>
  from<Definition extends TableDefinition, Name extends string>(
    from: Table<Definition, Name>
  ): SelectionFrom<Result, Meta>
  from(from: HasQuery): Select<unknown, Meta>
  from(from: HasQuery | Table) {
    if (hasQuery(from))
      return new Select({
        ...getData(this),
        selection: this[internal.data].selection ?? sql`*`,
        from: sql`(${getQuery(from).inlineFields(true)})`
      })
    return new Joinable({
      ...getData(this),
      selection:
        this[internal.data].selection ?? getTable(from).selectColumns(),
      from: sql.identifier(getTable(from).name)
    })
  }
}

export function select(): WithSelection<undefined, QueryMeta>
export function select<Input extends SelectionInput>(
  selection: Input
): WithSelection<SelectionRow<Input>, QueryMeta>
export function select(selection?: SelectionInput) {
  return new WithSelection({selection})
}

export function selectDistinct(): WithSelection<undefined, QueryMeta>
export function selectDistinct<Input extends SelectionInput>(
  selection: Input
): WithSelection<SelectionRow<Input>, QueryMeta>
export function selectDistinct(selection?: SelectionInput) {
  return new WithSelection({selection, distinct: true})
}
