import type {Expr} from '../Expr.ts'
import {
  getQuery,
  getSelection,
  getTable,
  hasQuery,
  meta,
  type HasExpr,
  type HasQuery,
  type HasSelection,
  type HasTable
} from '../Meta.ts'
import {Query, QueryData, type QueryMode} from '../Query.ts'
import {
  Selection,
  type SelectionInput,
  type SelectionRow
} from '../Selection.ts'
import {sql, type Sql} from '../Sql.ts'
import type {Table, TableDefinition, TableRow} from '../Table.ts'
import type {Expand, Nullable} from '../Types.ts'
import {Union} from './Union.ts'

class SelectData<Mode extends QueryMode> extends QueryData<Mode> {
  selection?: SelectionInput
  distinct?: boolean
  from?: Sql
  subject?: Sql
  where?: HasExpr
  groupBy?: Sql
  having?: HasExpr
  orderBy?: Sql
  limit?: Sql
}

const internal = Symbol()

export class Select<Result, Mode extends QueryMode>
  extends Query<Result, Mode>
  implements HasSelection
{
  [internal]: SelectData<Mode>
  constructor(data: SelectData<Mode>) {
    super(data)
    this[internal] = data
  }

  where(where: Expr<boolean>): Select<Result, Mode> {
    return new Select({...this[internal], where})
  }

  groupBy(...exprs: Array<Expr>): Select<Result, Mode> {
    return new Select({
      ...this[internal],
      groupBy: sql.join(exprs, sql.unsafe(', '))
    })
  }

  having(having: Expr<boolean>): Select<Result, Mode> {
    return new Select({...this[internal], having})
  }

  orderBy(...exprs: Array<Expr>): Select<Result, Mode> {
    return new Select({
      ...this[internal],
      orderBy: sql.join(exprs, sql.unsafe(', '))
    })
  }

  union(
    right: Select<Result, Mode> | Union<Result, Mode>
  ): Union<Result, Mode> {
    return new Union({
      ...this[internal],
      left: this,
      operator: sql`union`,
      right
    })
  }

  unionAll(right: Select<Result, Mode>): Union<Result, Mode> {
    return new Union({
      ...this[internal],
      left: this,
      operator: sql`union all`,
      right
    })
  }

  intersect(right: Select<Result, Mode>): Union<Result, Mode> {
    return new Union({
      ...this[internal],
      left: this,
      operator: sql`intersect`,
      right
    })
  }

  except(right: Select<Result, Mode>): Union<Result, Mode> {
    return new Union({
      ...this[internal],
      left: this,
      operator: sql`except`,
      right
    })
  }

  get [meta.selection]() {
    const {selection} = this[internal]
    if (!selection) throw new Error('todo')
    return new Selection(selection)
  }

  get [meta.query]() {
    const {distinct, from, where, groupBy, having, orderBy, limit} =
      this[internal]
    const select = getSelection(this).toSql()
    return sql.join([
      distinct ? sql`select distinct` : sql`select`,
      select,
      from && sql`from ${from}`,
      where && sql`where ${where}`,
      groupBy && sql`group by ${groupBy}`,
      having && sql`having ${having}`,
      orderBy && sql`order by ${orderBy}`,
      limit && sql`limit ${limit}`
    ])
  }
}

class Joinable extends Select<unknown, QueryMode> {
  #join(operator: Sql, right: HasTable, on: Expr<boolean>) {
    const rightTable = getTable(right)
    return new Joinable({
      ...this[internal],
      from: sql.join([
        this[internal].from,
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

interface AllFrom<Result, Mode extends QueryMode, Tables = Result>
  extends Select<Result, Mode> {
  leftJoin<Definition extends TableDefinition, Name extends string>(
    right: Table<Definition, Name>,
    on: Expr<boolean>
  ): AllFrom<Expand<Tables & Record<Name, TableRow<Definition> | null>>, Mode>
  rightJoin<Definition extends TableDefinition, Name extends string>(
    right: Table<Definition, Name>,
    on: Expr<boolean>
  ): AllFrom<
    Expand<Nullable<Tables> & Record<Name, TableRow<Definition>>>,
    Mode
  >
  innerJoin<Definition extends TableDefinition, Name extends string>(
    right: Table<Definition, Name>,
    on: Expr<boolean>
  ): AllFrom<Expand<Tables & Record<Name, TableRow<Definition>>>, Mode>
  fullJoin<Definition extends TableDefinition, Name extends string>(
    right: Table<Definition, Name>,
    on: Expr<boolean>
  ): AllFrom<
    Expand<Nullable<Tables> & Record<Name, TableRow<Definition> | null>>,
    Mode
  >
}

interface SelectionFrom<Result, Mode extends QueryMode>
  extends Select<Result, Mode> {
  leftJoin<Definition extends TableDefinition, Name extends string>(
    right: Table<Definition, Name>,
    on: Expr<boolean>
  ): SelectionFrom<Result, Mode>
  rightJoin<Definition extends TableDefinition, Name extends string>(
    right: Table<Definition, Name>,
    on: Expr<boolean>
  ): SelectionFrom<Result, Mode>
  innerJoin<Definition extends TableDefinition, Name extends string>(
    right: Table<Definition, Name>,
    on: Expr<boolean>
  ): SelectionFrom<Result, Mode>
  fullJoin<Definition extends TableDefinition, Name extends string>(
    right: Table<Definition, Name>,
    on: Expr<boolean>
  ): SelectionFrom<Result, Mode>
}

export class WithSelection<Result, Mode extends QueryMode> extends Select<
  Result,
  Mode
> {
  from<Definition extends TableDefinition, Name extends string>(
    this: WithSelection<undefined, Mode>,
    from: Table<Definition, Name>
  ): AllFrom<TableRow<Definition>, Mode, Record<Name, TableRow<Definition>>>
  from<Definition extends TableDefinition, Name extends string>(
    from: Table<Definition, Name>
  ): SelectionFrom<Result, Mode>
  from(from: HasQuery): Select<unknown, Mode>
  from(from: HasQuery | Table) {
    if (hasQuery(from))
      return new Select({
        ...this[internal],
        selection: this[internal].selection ?? sql`*`,
        from: sql`(${getQuery(from).inlineFields(true)})`
      })
    return new Joinable({
      ...this[internal],
      selection: this[internal].selection ?? getTable(from).selectColumns(),
      from: sql.identifier(getTable(from).name)
    })
  }
}

export function select(): WithSelection<undefined, undefined>
export function select<Input extends SelectionInput>(
  selection: Input
): WithSelection<SelectionRow<Input>, undefined>
export function select(selection?: SelectionInput) {
  return new WithSelection({selection})
}

export function selectDistinct(): WithSelection<undefined, undefined>
export function selectDistinct<Input extends SelectionInput>(
  selection: Input
): WithSelection<SelectionRow<Input>, undefined>
export function selectDistinct(selection?: SelectionInput) {
  return new WithSelection({selection, distinct: true})
}
