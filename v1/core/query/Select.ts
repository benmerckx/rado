import {type Expr, type Input, input} from '../Expr.ts'
import type {Field} from '../Field.ts'
import {
  type HasQuery,
  type HasSelection,
  type HasSql,
  type HasTable,
  getData,
  getQuery,
  getSelection,
  getTable,
  hasQuery,
  internal
} from '../Internal.ts'
import {Query, QueryData, type QueryMeta} from '../Query.ts'
import {
  Selection,
  type SelectionInput,
  type SelectionRecord,
  type SelectionRow
} from '../Selection.ts'
import {type Sql, sql} from '../Sql.ts'
import type {Table, TableDefinition, TableRow} from '../Table.ts'
import type {Expand, Nullable} from '../Types.ts'
import {Union} from './Union.ts'

class SelectData<Meta extends QueryMeta> extends QueryData<Meta> {
  selection?: SelectionInput
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
    const select = getSelection(this).toSql(distinct)
    return sql.query({
      select,
      from,
      where,
      'group by': groupBy,
      'order by': orderBy,
      limit,
      offset
    })
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

type MarkFieldsAsNullable<Input, Table extends string> = Expand<{
  [K in keyof Input]: Input[K] extends Field<infer T, Table>
    ? Expr<T | null>
    : Input[K] extends Record<string, Field<unknown, Table> | Sql<unknown>>
    ? Input[K] | null
    : Input[K] extends SelectionRecord
    ? MarkFieldsAsNullable<Input[K], Table>
    : Input[K]
}>

interface SelectionFrom<Input, Meta extends QueryMeta>
  extends Select<SelectionRow<Input>, Meta> {
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

export class Selected<Input, Meta extends QueryMeta> extends Select<
  SelectionRow<Input>,
  Meta
> {
  from(from: HasQuery | Table) {
    if (hasQuery(from))
      return new Select({
        ...getData(this),
        selection: this[internal.data].selection ?? sql`*`,
        from: sql`(${getQuery(from).inlineFields(true)})`
      })
    return new Joinable({
      ...getData(this),
      selection: this[internal.data].selection ?? from,
      from: sql.identifier(getTable(from).name)
    })
  }
}

export interface WithoutSelection<Meta extends QueryMeta>
  extends Selected<undefined, Meta> {
  from<Definition extends TableDefinition, Name extends string>(
    from: Table<Definition, Name>
  ): AllFrom<TableRow<Definition>, Meta, Record<Name, TableRow<Definition>>>
}

export interface WithSelection<Input, Meta extends QueryMeta>
  extends Selected<undefined, Meta> {
  from<Definition extends TableDefinition, Name extends string>(
    from: Table<Definition, Name>
  ): SelectionFrom<Input, Meta>
}

export function select(): WithoutSelection<QueryMeta>
export function select<Input extends SelectionInput>(
  selection: Input
): WithSelection<Input, QueryMeta>
export function select(selection?: SelectionInput) {
  return new Selected({selection})
}

export function selectDistinct(): WithoutSelection<QueryMeta>
export function selectDistinct<Input extends SelectionInput>(
  selection: Input
): WithSelection<Input, QueryMeta>
export function selectDistinct(selection?: SelectionInput) {
  return new Selected({selection, distinct: true})
}
