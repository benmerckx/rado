import {
  type HasSelection,
  type HasSql,
  type HasTable,
  type HasTarget,
  getData,
  getQuery,
  getSelection,
  getSql,
  getTarget,
  hasTable,
  hasTarget,
  internalData,
  internalQuery,
  internalSelection,
  internalSql,
  internalTarget
} from '../Internal.ts'
import type {JoinOperator} from '../Join.ts'
import type {QueryMeta} from '../MetaData.ts'
import {
  type IsNullable,
  type MakeNullable,
  type Selection,
  type SelectionRecord,
  type SelectionRow,
  selection
} from '../Selection.ts'
import {Sql, sql} from '../Sql.ts'
import type {Table, TableDefinition, TableFields} from '../Table.ts'
import type {Expand} from '../Types.ts'
import {and} from '../expr/Conditions.ts'
import type {Field} from '../expr/Field.ts'
import {type Input as UserInput, input} from '../expr/Input.ts'
import {UnionBase, type UnionBaseData} from './Union.ts'

export type SelectionType = 'selection' | 'allFrom' | 'joinTables'

export interface SelectData<Meta extends QueryMeta = QueryMeta>
  extends UnionBaseData<Meta> {
  distinct?: boolean
  distinctOn?: Array<HasSql>
  from?: HasSql
  where?: HasSql
  groupBy?: HasSql
  having?: HasSql
  orderBy?: HasSql
  limit?: HasSql
  offset?: HasSql
}

export class Select<Input, Meta extends QueryMeta = QueryMeta>
  extends UnionBase<Input, Meta>
  implements HasSelection, SelectBase<Input, Meta>
{
  readonly [internalData]: SelectData<Meta>

  constructor(data: SelectData<Meta>) {
    super(data)
    this[internalData] = data
  }

  as(alias: string): SubQuery<Input> {
    const fields = getSelection(this).makeVirtual(alias)
    return Object.assign(<any>fields, {
      [internalTarget]: sql`(${getQuery(this)}) as ${sql.identifier(
        alias
      )}`.inlineFields(true)
    })
  }

  from(target: HasTarget | HasSql): Select<Input, Meta> {
    const {select: current} = getData(this)
    const from = hasTarget(target) ? getTarget(target) : getSql(target)
    const isTable = hasTable(target)
    const selected =
      current ?? (isTable ? selection.table(<any>target) : selection(sql`*`))
    return new Select({
      ...getData(this),
      select: selected,
      from
    })
  }

  #join(
    operator: JoinOperator,
    right: HasTable | HasTarget,
    on: HasSql<boolean>
  ): Select<Input, Meta> {
    const {from, select: current} = getData(this)
    return new Select({
      ...getData(this),
      select: hasTable(right) ? current?.join(right, operator) : current,
      from: sql.join([
        from,
        sql.unsafe(`${operator} join`),
        getTarget(<HasTarget>right),
        sql`on ${on}`
      ])
    })
  }

  leftJoin(
    right: HasTable | HasTarget,
    on: HasSql<boolean>
  ): Select<Input, Meta> {
    return this.#join('left', right, on)
  }

  rightJoin(
    right: HasTable | HasTarget,
    on: HasSql<boolean>
  ): Select<Input, Meta> {
    return this.#join('right', right, on)
  }

  innerJoin(
    right: HasTable | HasTarget,
    on: HasSql<boolean>
  ): Select<Input, Meta> {
    return this.#join('inner', right, on)
  }

  fullJoin(
    right: HasTable | HasTarget,
    on: HasSql<boolean>
  ): Select<Input, Meta> {
    return this.#join('full', right, on)
  }

  where(...where: Array<HasSql<boolean> | undefined>): Select<Input, Meta> {
    return new Select({...getData(this), where: and(...where)})
  }

  groupBy(...exprs: Array<HasSql>): Select<Input, Meta> {
    return new Select({
      ...getData(this),
      groupBy: sql.join(exprs, sql.unsafe(', '))
    })
  }

  having(
    having: HasSql<boolean> | ((self: Input) => HasSql<boolean>)
  ): Select<Input, Meta> {
    return new Select({
      ...getData(this),
      having:
        typeof having === 'function'
          ? having(<Input>getSelection(this).input)
          : having
    })
  }

  orderBy(...exprs: Array<HasSql>): Select<Input, Meta> {
    return new Select({
      ...getData(this),
      orderBy: sql.join(exprs, sql.unsafe(', '))
    })
  }

  limit(limit: UserInput<number>): Select<Input, Meta> {
    return new Select({...getData(this), limit: input(limit)})
  }

  offset(offset: UserInput<number>): Select<Input, Meta> {
    return new Select({
      ...getData(this),
      offset: input(offset)
    })
  }

  get [internalSelection](): Selection {
    const {select} = getData(this)
    if (!select) throw new Error('No selection defined')
    return select
  }

  get [internalQuery](): Sql {
    return new Sql(emitter => emitter.emitSelect(getData(this)))
  }

  get [internalSql](): Sql<SelectionRow<Input>> {
    return sql`(${getQuery(this)})`
  }
}

export type SubQuery<Input> = Input & HasTarget

export interface SelectBase<Input, Meta extends QueryMeta = QueryMeta>
  extends UnionBase<Input, Meta>,
    HasSelection,
    HasSql<SelectionRow<Input>> {
  where(...where: Array<HasSql<boolean> | undefined>): Select<Input, Meta>
  groupBy(...exprs: Array<HasSql>): Select<Input, Meta>
  having(having: HasSql<boolean>): Select<Input, Meta>
  orderBy(...exprs: Array<HasSql>): Select<Input, Meta>
  limit(limit: UserInput<number>): Select<Input, Meta>
  offset(offset: UserInput<number>): Select<Input, Meta>
  as(name: string): SubQuery<Input>
}

export interface WithoutSelection<Meta extends QueryMeta> {
  from<Definition extends TableDefinition, Name extends string>(
    from: Table<Definition, Name>
  ): AllFrom<
    TableFields<Definition>,
    Meta,
    Record<Name, TableFields<Definition>>
  >
  from<Input>(from: SubQuery<Input>): SelectionFrom<Input, Meta>
}

export interface WithSelection<Input, Meta extends QueryMeta>
  extends SelectBase<Input, Meta>,
    HasSql<SelectionRow<Input>> {
  from<Definition extends TableDefinition, Name extends string>(
    from: Table<Definition, Name>
  ): SelectionFrom<Input, Meta>
  from(from: SubQuery<unknown>): SelectionFrom<Input, Meta>
  from(target: HasSql): Select<Input, Meta>
}

export interface AllFrom<Input, Meta extends QueryMeta, Tables = Input>
  extends SelectBase<Input, Meta> {
  leftJoin<Definition extends TableDefinition, Name extends string>(
    right: Table<Definition, Name>,
    on: HasSql<boolean>
  ): AllFrom<
    Expand<Tables & MakeNullable<Record<Name, TableFields<Definition>>>>,
    Meta
  >
  rightJoin<Definition extends TableDefinition, Name extends string>(
    right: Table<Definition, Name>,
    on: HasSql<boolean>
  ): AllFrom<
    Expand<MakeNullable<Tables> & Record<Name, TableFields<Definition>>>,
    Meta
  >
  innerJoin<Definition extends TableDefinition, Name extends string>(
    right: Table<Definition, Name>,
    on: HasSql<boolean>
  ): AllFrom<Expand<Tables & Record<Name, TableFields<Definition>>>, Meta>
  fullJoin<Definition extends TableDefinition, Name extends string>(
    right: Table<Definition, Name>,
    on: HasSql<boolean>
  ): AllFrom<
    Expand<
      MakeNullable<Tables> & MakeNullable<Record<Name, TableFields<Definition>>>
    >,
    Meta
  >
}

type MarkFieldsAsNullable<Input, TableName extends string> = Expand<{
  [K in keyof Input]: Input[K] extends Field<infer T, TableName>
    ? HasSql<T | null>
    : Input[K] extends Table<infer Definition, TableName>
      ? TableFields<Definition> & IsNullable
      : Input[K] extends Record<
            string,
            Field<unknown, TableName> | HasSql<unknown>
          >
        ? Input[K] & IsNullable
        : Input[K] extends SelectionRecord
          ? MarkFieldsAsNullable<Input[K], TableName>
          : Input[K]
}>

export interface SelectionFrom<Input, Meta extends QueryMeta>
  extends SelectBase<Input, Meta> {
  leftJoin<Definition extends TableDefinition, Name extends string>(
    right: Table<Definition, Name>,
    on: HasSql<boolean>
  ): SelectionFrom<MarkFieldsAsNullable<Input, Name>, Meta>
  leftJoin(right: HasTarget, on: HasSql<boolean>): SelectionFrom<Input, Meta>
  rightJoin<Definition extends TableDefinition, Name extends string>(
    right: Table<Definition, Name>,
    on: HasSql<boolean>
  ): SelectionFrom<Input, Meta>
  rightJoin(right: HasTarget, on: HasSql<boolean>): SelectionFrom<Input, Meta>
  innerJoin<Definition extends TableDefinition, Name extends string>(
    right: Table<Definition, Name>,
    on: HasSql<boolean>
  ): SelectionFrom<Input, Meta>
  innerJoin(right: HasTarget, on: HasSql<boolean>): SelectionFrom<Input, Meta>
  fullJoin<Definition extends TableDefinition, Name extends string>(
    right: Table<Definition, Name>,
    on: HasSql<boolean>
  ): SelectionFrom<Input, Meta>
  fullJoin(right: HasTarget, on: HasSql<boolean>): SelectionFrom<Input, Meta>
}
