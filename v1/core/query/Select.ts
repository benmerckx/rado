import {emitSelect} from '../Emitter.ts'
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
  hasTable,
  internalData,
  internalQuery,
  internalSelection
} from '../Internal.ts'
import type {QueryMeta} from '../MetaData.ts'
import {Query, QueryData} from '../Query.ts'
import {
  type SelectionInput,
  type SelectionRecord,
  type SelectionRow,
  selection
} from '../Selection.ts'
import {type Sql, sql} from '../Sql.ts'
import type {Table, TableDefinition, TableRow} from '../Table.ts'
import type {Expand, Nullable} from '../Types.ts'
import {Union} from './Union.ts'

export type SelectionType = 'selection' | 'allFrom' | 'joinTables'

export class SelectData<Meta extends QueryMeta> extends QueryData<Meta> {
  select!: {
    type: SelectionType
    tables: Array<string>
    nullable: Array<string>
    input?: SelectionInput
  }
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
    const {select: current} = getData(this)
    const from = hasQuery(target)
      ? sql`(${getQuery(target).inlineFields(true)})`
      : getTable(target).from()
    const isTable = hasTable(target)
    const selectionInput = current.input ?? (isTable ? target : sql`*`)
    return new Select({
      ...getData(this),
      select: {
        ...current,
        input: selectionInput,
        tables: isTable ? [getTable(target).aliased] : []
      },
      from
    })
  }

  #join(
    operator: 'left' | 'right' | 'inner' | 'full',
    right: HasTable,
    on: Expr<boolean>
  ): Select<Result, Meta> {
    const {from, select: current} = getData(this)
    const rightTable = getTable(right)
    const addNullable: Array<string> = []
    if (operator === 'right' || operator === 'full')
      addNullable.push(...current.tables)
    if (operator === 'left' || operator === 'full')
      addNullable.push(rightTable.aliased)
    const select =
      current.type === 'selection'
        ? current
        : {
            type: 'joinTables' as const,
            input: <SelectionInput>(current.type === 'allFrom'
              ? {
                  [getTable(current.input as HasTable).aliased]: current.input,
                  [rightTable.aliased]: right
                }
              : {...current.input, [rightTable.aliased]: right}),
            tables: [...current.tables, rightTable.aliased],
            nullable: current.nullable.concat(addNullable)
          }
    return new Select({
      ...getData(this),
      select,
      from: sql.join([
        from,
        sql.unsafe(`${operator} join`),
        rightTable.from(),
        sql`on ${on}`
      ])
    })
  }

  leftJoin(right: HasTable, on: Expr<boolean>): Select<Result, Meta> {
    return this.#join('left', right, on)
  }

  rightJoin(right: HasTable, on: Expr<boolean>): Select<Result, Meta> {
    return this.#join('right', right, on)
  }

  innerJoin(right: HasTable, on: Expr<boolean>): Select<Result, Meta> {
    return this.#join('inner', right, on)
  }

  fullJoin(right: HasTable, on: Expr<boolean>): Select<Result, Meta> {
    return this.#join('full', right, on)
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
      selection: getSelection(this),
      left: this,
      operator: sql`union`,
      right
    })
  }

  unionAll(right: Select.Base<Result, Meta>): Union<Result, Meta> {
    return new Union({
      ...getData(this),
      selection: getSelection(this),
      left: this,
      operator: sql`union all`,
      right
    })
  }

  intersect(right: Select.Base<Result, Meta>): Union<Result, Meta> {
    return new Union({
      ...getData(this),
      selection: getSelection(this),
      left: this,
      operator: sql`intersect`,
      right
    })
  }

  except(right: Select.Base<Result, Meta>): Union<Result, Meta> {
    return new Union({
      ...getData(this),
      selection: getSelection(this),
      left: this,
      operator: sql`except`,
      right
    })
  }

  get [internalSelection]() {
    const {select} = getData(this)
    if (!select.input) throw new Error('No selection defined')
    return selection(select.input, new Set(select.nullable))
  }

  get [internalQuery]() {
    return sql.chunk(emitSelect, getData(this))
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
