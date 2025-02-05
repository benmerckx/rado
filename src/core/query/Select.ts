import {
  type HasSelection,
  type HasSql,
  type HasTarget,
  getData,
  getQuery,
  getSelection,
  hasTable,
  hasTarget,
  internalData,
  internalQuery,
  internalSelection,
  internalSql,
  internalTarget
} from '../Internal.ts'
import type {QueryMeta} from '../MetaData.ts'
import {
  type IsNullable,
  type MakeNullable,
  type Selection,
  type SelectionRecord,
  type SelectionRow,
  selection
} from '../Selection.ts'
import {type Sql, sql} from '../Sql.ts'
import type {Table, TableDefinition, TableFields} from '../Table.ts'
import type {Expand} from '../Types.ts'
import {and} from '../expr/Conditions.ts'
import type {Field} from '../expr/Field.ts'
import type {Input as UserInput} from '../expr/Input.ts'
import type {Join, SelectQuery} from './Query.ts'
import {UnionBase} from './Union.ts'

export class Select<Input, Meta extends QueryMeta = QueryMeta>
  extends UnionBase<Input, Meta>
  implements HasSelection, SelectBase<Input, Meta>
{
  readonly [internalData]: SelectQuery<Input>

  constructor(query: SelectQuery<Input>) {
    super(query)
    this[internalData] = query
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
    const isTable = hasTable(target)
    const selected =
      current ?? (isTable ? selection.table(<any>target) : selection(sql`*`))
    return new Select<Input, Meta>({
      ...getData(this),
      select: selected,
      from: target
    })
  }

  #fromTarget(): [HasTarget, ...Array<Join>] {
    const {from} = getData(this)
    if (!from) throw new Error('No target defined')
    if (!hasTarget(from)) throw new Error('No target defined')
    return Array.isArray(from) ? (from as any) : [from]
  }

  leftJoin(leftJoin: HasTarget, on: HasSql<boolean>): Select<Input, Meta> {
    return new Select({
      ...getData(this),
      from: [...this.#fromTarget(), {leftJoin, on}]
    })
  }

  rightJoin(rightJoin: HasTarget, on: HasSql<boolean>): Select<Input, Meta> {
    return new Select({
      ...getData(this),
      from: [...this.#fromTarget(), {rightJoin, on}]
    })
  }

  innerJoin(innerJoin: HasTarget, on: HasSql<boolean>): Select<Input, Meta> {
    return new Select({
      ...getData(this),
      from: [...this.#fromTarget(), {innerJoin, on}]
    })
  }

  fullJoin(fullJoin: HasTarget, on: HasSql<boolean>): Select<Input, Meta> {
    return new Select({
      ...getData(this),
      from: [...this.#fromTarget(), {fullJoin, on}]
    })
  }

  where(...where: Array<HasSql<boolean> | undefined>): Select<Input, Meta> {
    return new Select({...getData(this), where: and(...where)})
  }

  groupBy(...groupBy: Array<HasSql>): Select<Input, Meta> {
    return new Select({
      ...getData(this),
      groupBy
    })
  }

  having(
    having: HasSql<boolean> | (() => HasSql<boolean>)
  ): Select<Input, Meta> {
    return new Select({
      ...getData(this),
      having
    })
  }

  orderBy(...orderBy: Array<HasSql>): Select<Input, Meta> {
    return new Select({
      ...getData(this),
      orderBy
    })
  }

  limit(limit: UserInput<number>): Select<Input, Meta> {
    return new Select({...getData(this), limit})
  }

  offset(offset: UserInput<number>): Select<Input, Meta> {
    return new Select({
      ...getData(this),
      offset
    })
  }

  get [internalSelection](): Selection {
    const {select} = getData(this)
    if (!select) throw new Error('No selection defined')
    return select
  }

  get [internalQuery](): Sql {
    return sql.chunk('emitSelect', getData(this))
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
