import {
  getData,
  getQuery,
  getSelection,
  getSql,
  getTable,
  getTarget,
  hasTable,
  hasTarget,
  internalData,
  internalQuery,
  internalSelection,
  internalSql,
  internalTarget,
  type HasSelection,
  type HasSql,
  type HasTable,
  type HasTarget
} from '../Internal.ts'
import type {QueryMeta} from '../MetaData.ts'
import type {Query} from '../Query.ts'
import {
  selection,
  type IsNullable,
  type MakeNullable,
  type Selection,
  type SelectionInput,
  type SelectionRecord,
  type SelectionRow
} from '../Selection.ts'
import {sql, type Sql} from '../Sql.ts'
import type {Table, TableDefinition, TableFields} from '../Table.ts'
import type {Expand} from '../Types.ts'
import {and} from '../expr/Conditions.ts'
import type {Field} from '../expr/Field.ts'
import {input, type Input as UserInput} from '../expr/Input.ts'
import {UnionBase, type UnionBaseData} from './Union.ts'

export type SelectionType = 'selection' | 'allFrom' | 'joinTables'

export interface SelectData<Meta extends QueryMeta = QueryMeta>
  extends UnionBaseData<Meta> {
  select: {
    type: SelectionType
    tables: Array<string>
    selection?: Selection
  }
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
    const selected = current.selection
    const from = hasTarget(target) ? getTarget(target) : getSql(target)
    const isTable = hasTable(target)
    const selectionInput = selected ?? selection(isTable ? target : sql`*`)
    return new Select({
      ...getData(this),
      select: {
        ...current,
        selection: selectionInput,
        tables: isTable ? [getTable(target).aliased] : []
      },
      from
    })
  }

  #join(
    operator: 'left' | 'right' | 'inner' | 'full',
    right: HasTable,
    on: HasSql<boolean>
  ): Select<Input, Meta> {
    const {from, select: current} = getData(this)
    const selected = current.selection
    const rightTable = getTable(right)
    const addNullable: Array<string> = []
    if (operator === 'right' || operator === 'full')
      addNullable.push(...current.tables)
    if (operator === 'left' || operator === 'full')
      addNullable.push(rightTable.aliased)
    if (selected) addNullable.push(...selected.nullable)
    const select =
      current.type === 'selection'
        ? current
        : {
            type: 'joinTables' as const,
            selection: selection(<SelectionInput>(current.type === 'allFrom'
                ? {
                    // Todo: handle this properly
                    [getTable(selected!.input as any).aliased]: selected!.input,
                    [rightTable.aliased]: right
                  }
                : {
                    ...selected?.input,
                    [rightTable.aliased]: right
                  }), addNullable),
            tables: [...current.tables, rightTable.aliased]
          }
    return new Select({
      ...getData(this),
      select,
      from: sql.join([
        from,
        sql.unsafe(`${operator} join`),
        rightTable.target(),
        sql`on ${on}`
      ])
    })
  }

  leftJoin(right: HasTable, on: HasSql<boolean>): Select<Input, Meta> {
    return this.#join('left', right, on)
  }

  rightJoin(right: HasTable, on: HasSql<boolean>): Select<Input, Meta> {
    return this.#join('right', right, on)
  }

  innerJoin(right: HasTable, on: HasSql<boolean>): Select<Input, Meta> {
    return this.#join('inner', right, on)
  }

  fullJoin(right: HasTable, on: HasSql<boolean>): Select<Input, Meta> {
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

  having(having: HasSql<boolean>): Select<Input, Meta> {
    return new Select({...getData(this), having})
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
    if (!select.selection) throw new Error('No selection defined')
    return select.selection
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
  /*union(right: UnionBase<Input, Meta>): Union<Input, Meta>
  unionAll(right: UnionBase<Input, Meta>): Union<Input, Meta>
  intersect(right: UnionBase<Input, Meta>): Union<Input, Meta>
  intersectAll(
    this: UnionBase<Input, IsPostgres | IsMysql>,
    right: UnionBase<Input, Meta>
  ): Union<Input, Meta>
  except(right: UnionBase<Input, Meta>): Union<Input, Meta>
  exceptAll(
    this: UnionBase<Input, IsPostgres | IsMysql>,
    right: UnionBase<Input, Meta>
  ): Union<Input, Meta>*/
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
  extends Query<SelectionRow<Input>, Meta>,
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
  rightJoin<Definition extends TableDefinition, Name extends string>(
    right: Table<Definition, Name>,
    on: HasSql<boolean>
  ): SelectionFrom<Input, Meta>
  innerJoin<Definition extends TableDefinition, Name extends string>(
    right: Table<Definition, Name>,
    on: HasSql<boolean>
  ): SelectionFrom<Input, Meta>
  fullJoin<Definition extends TableDefinition, Name extends string>(
    right: Table<Definition, Name>,
    on: HasSql<boolean>
  ): SelectionFrom<Input, Meta>
}
