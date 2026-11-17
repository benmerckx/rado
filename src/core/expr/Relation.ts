import {Column} from '../Column.ts'
import {
  type HasQuery,
  type HasSelection,
  type HasSql,
  type HasTable,
  type HasTarget,
  cached,
  getData,
  getField,
  getSelection,
  getTable,
  hasSql,
  internalColumns,
  internalQuery,
  internalTable
} from '../Internal.ts'
import type {SelectQuery} from '../query/Query.ts'
import {selectQuery} from '../query/Select.ts'
import {
  type Extend,
  type SelectionInput,
  type SelectionRecord,
  type SelectionRow,
  extend
} from '../Selection.ts'
import {type Sql, sql} from '../Sql.ts'
import {
  type Scope,
  type Table,
  TableApi,
  type TableDefinition,
  type TableRow
} from '../Table.ts'
import {count} from './Aggregate.ts'
import {and, eq, exists, not} from './Conditions.ts'
import type {Field} from './Field.ts'
import {Include, type IncludeQuery} from './Include.ts'
import {type Input as UserInput, mapToColumn} from './Input.ts'

export type RelationKind = 'many' | 'one' | 'required'

export type RelationRow<Input, Kind extends RelationKind> = Kind extends 'many'
  ? Array<SelectionRow<Input>>
  : Kind extends 'required'
    ? SelectionRow<Input>
    : SelectionRow<Input> | null

// Narrowing the rows of a to-one relation can leave it without a match
type Narrowed<Kind extends RelationKind> = Kind extends 'many' ? 'many' : 'one'

type Value<C> = C extends Column<infer V> ? NonNullable<V> : never

// Target columns mapped to the fields they are equal to
export type RelationKeys<
  Target extends TableDefinition,
  Root extends string = string
> = {
  readonly [K in keyof Target]?: Field<Value<Target[K]> | null, Root>
}

type RootOf<Keys> =
  Keys[keyof Keys] extends Field<unknown, infer Root> ? Root : never

type Single<Root, All = Root> = Root extends unknown
  ? [All] extends [Root]
    ? Root
    : never
  : never

// Reads as the reason when a key is not one a relation can use
type Checked<Keys, Target extends TableDefinition, Name extends string> = {
  [K in keyof Keys]: K extends keyof Target
    ? Keys[K] extends Field<unknown, infer Root, infer Key>
      ? string extends Root | Key
        ? 'needs a table field'
        : [Root] extends [Single<RootOf<Keys>>]
          ? [Name] extends [Root]
            ? 'needs an alias'
            : Keys[K]
          : 'needs one parent'
      : never
    : `no column ${K & string}`
}

type Known<Keys, Target extends TableDefinition> = {
  [K in keyof Keys]: K extends keyof Target
    ? Keys[K]
    : `no column ${K & string}`
}

type KeyName<F> =
  F extends Field<unknown, string, infer Key extends string> ? Key : never
type KeyValue<F> = F extends Field<infer V> ? V : never

type ParentRow<Keys> = {
  [K in keyof Keys as KeyName<Keys[K]>]: KeyValue<Keys[K]>
}

type ParentFields<Keys, Root extends string> = {
  [K in keyof Keys as KeyName<Keys[K]>]: Field<
    KeyValue<Keys[K]>,
    Root,
    KeyName<Keys[K]>
  >
}

type Filled<Definition extends TableDefinition, Key> = {
  [K in keyof Definition]: K extends Key
    ? Definition[K] extends Column<infer V, [infer N extends boolean, boolean]>
      ? Column<V, [N, false]>
      : never
    : Definition[K]
}

// What a relation selected outside of its parent reads as
export type Outside<Parent extends string> = `needs ${Parent} in from`

export type Rooted<Input, Names extends string> =
  Input extends Relation<any, any, infer Parent, any, any>
    ? [Parent] extends [Names]
      ? Input
      : HasSql<Outside<Parent>>
    : Input extends HasSql | HasTarget
      ? Input
      : Input extends object
        ? {[K in keyof Input]: Rooted<Input[K], Names>}
        : Input

type Keys = Record<string, Field>

interface LinkData {
  link: {target: Table; keys: Keys}
}

export class Relation<
  Input,
  Kind extends RelationKind = RelationKind,
  Parent extends string = never,
  Target extends string = string,
  Link = undefined
>
  extends Include<RelationRow<Input, Kind>>
  implements HasQuery
{
  declare private link: [Parent, Target, Link]

  #with(query: Partial<SelectQuery>): Relation<any, any, any, any, any> {
    return new Relation({...getData(this), ...query})
  }

  select<Next extends SelectionInput>(
    select: Next & Rooted<Next, Target>
  ): Relation<Next, Kind, Parent, Target>
  select<
    Definition extends TableDefinition,
    Name extends Target,
    Extra extends SelectionRecord
  >(
    table: Table<Definition, Name>,
    extra: Extra & Rooted<Extra, Target>
  ): Relation<Extend<Definition, Name, Extra>, Kind, Parent, Target>
  select(
    select: SelectionInput,
    extra?: SelectionRecord
  ): Relation<any, any, any, any, any> {
    return this.#with({select: extend(select, extra)})
  }

  where(
    ...where: Array<HasSql<boolean> | undefined>
  ): Relation<Input, Narrowed<Kind>, Parent, Target> {
    return this.#with({where: and(getData(this).where, ...where)})
  }

  orderBy(...orderBy: Array<HasSql>): Relation<Input, Kind, Parent, Target> {
    return this.#with({orderBy})
  }

  limit(limit: UserInput<number>): Relation<Input, Kind, Parent, Target> {
    return this.#with({limit})
  }

  offset(offset: UserInput<number>): Relation<Input, Kind, Parent, Target> {
    return this.#with({offset})
  }

  notNull(
    this: Relation<Input, 'one', Parent, Target, Link>
  ): Relation<Input, 'required', Parent, Target, Link> {
    return this as Relation<any, any, any, any, any>
  }

  first(
    this: Relation<Input, 'many', Parent, Target, Link>
  ): Relation<Input, 'one', Parent, Target, Link> {
    return this.#with({first: true, limit: 1} as Partial<SelectQuery>)
  }

  alias<
    Definition extends TableDefinition,
    Keys,
    Name extends string,
    Root extends string
  >(
    this: Relation<Input, Kind, Parent, Target, [Definition, Keys]>,
    target: Table<Definition, Name>,
    parent: HasTable<TableDefinition, Root> & ParentFields<Keys, Root>
  ): Relation<Table<Definition, Name>, Kind, Root, Name, [Definition, Keys]> {
    const data = getData(this) as IncludeQuery & LinkData
    const fields = parent as Record<string, Field>
    const keys = Object.entries(data.link.keys).map(([to, field]) => [
      to,
      fields[keyOf(field)]
    ])
    return keyed(data, target, Object.fromEntries(keys))
  }

  of<Definition extends TableDefinition, Keys>(
    this: Relation<Input, Kind, Parent, Target, [Definition, Keys]>,
    row: ParentRow<Keys>
  ): Scope<Filled<Definition, keyof Keys>> {
    const {target, keys} = (getData(this) as IncludeQuery & LinkData).link
    const api = getTable(target)
    const columns = {...api.columns}
    const where = []
    for (const [to, field] of Object.entries(keys)) {
      const from = keyOf(field)
      const data = getData(api.columns[to])
      const value = (row as Record<string, unknown>)[from]
      // A missing key would widen an update or delete to every row
      if (value === undefined) throw new Error(`Missing ${from}`)
      const $default = () => mapToColumn(data, value)
      columns[to] = new Column({...data, $default})
      where.push(eq((target as Record<string, any>)[to], value))
    }
    const scoped = {...api, columns, where: and(...where)}
    return {
      // The fields are what a bare returning() selects
      ...(getSelection(target).input as object),
      [internalTable]: Object.assign(new TableApi<any>(), scoped)
    }
  }

  many<
    Definition extends TableDefinition,
    Name extends string,
    Keys extends RelationKeys<Definition, Target>
  >(
    target: Table<Definition, Name>,
    keys: Keys & Known<Keys, Definition>
  ): Relation<Table<Definition, Name>, 'many', Parent, Target | Name> {
    const {from, where} = getData(this)
    const select = getSelection(target).input
    const join = {innerJoin: target, on: match(target, keys as Keys)}
    return new Relation(<any>{
      select,
      from: [from!, join].flat(),
      where,
      first: false
    })
  }

  every(where: HasSql<boolean>): Sql<boolean> {
    return not(exists(this.where(not(where))))
  }

  count(): Sql<number> {
    const query = {...getData(this), select: count(), orderBy: undefined}
    return sql<number>`(${selectQuery(query)})`.mapWith(Number)
  }

  get [internalQuery](): Sql {
    return cached(this, internalQuery, () => selectQuery(getData(this)))
  }
}

function keyOf(field: Field): string {
  const {key} = getField(field)
  if (!key) throw new Error('Not a table field')
  return key
}

function match(target: any, keys: object): Sql<boolean> {
  return and(
    ...Object.entries(keys).map(([to, field]) => eq(target[to], field))
  )
}

function keyed(
  data: {first: boolean},
  from: Table,
  keys: Keys
): Relation<any, any, any, any, any> {
  // Selecting the fields instead of the table keeps joined tables out of rows
  const select = getSelection(from).input
  const where = match(from, keys)
  const link = {target: from, keys}
  return new Relation(<any>{...data, select, from, where, link})
}

function relation(
  first: boolean,
  target: Table,
  on: Array<any>
): Relation<any, any, any, any, any> {
  const [keys] = on
  if (keys && !hasSql(keys)) return keyed({first}, target, keys)
  const select = getSelection(target).input
  return new Relation({select, from: target, where: and(...on), first})
}

type Named<Base> =
  Base extends HasTable<TableDefinition, infer Name> ? Name : never

export function relate<
  Base extends HasTable & HasSelection,
  Relations extends Record<string, Relation<any, any, Named<Base>, any, any>>
>(
  table: Base,
  relations: Relations & {[K in keyof Base]?: never}
): Base & Relations {
  // Copying descriptors leaves the create and drop getters unread
  return Object.defineProperties(<any>{}, {
    ...Object.getOwnPropertyDescriptors(table),
    ...Object.getOwnPropertyDescriptors(relations),
    [internalColumns]: {value: getSelection(table).input}
  })
}

type Keyed<
  Kind extends RelationKind,
  Definition extends TableDefinition,
  Name extends string,
  Keys
> = Relation<
  Table<Definition, Name>,
  Kind,
  Single<RootOf<Keys>>,
  Name,
  [Definition, Keys]
>

export function many<Definition extends TableDefinition, Name extends string>(
  target: Table<Definition, Name>,
  ...on: Array<HasSql<boolean>>
): Relation<Table<Definition, Name>, 'many', never, Name>
export function many<
  Definition extends TableDefinition,
  Name extends string,
  Keys extends RelationKeys<Definition>
>(
  target: Table<Definition, Name>,
  keys: Keys & Checked<Keys, Definition, Name>
): Keyed<'many', Definition, Name, Keys>
export function many(target: Table, ...on: Array<unknown>) {
  return relation(false, target, on)
}

export function one<Definition extends TableDefinition, Name extends string>(
  target: Table<Definition, Name>,
  ...on: Array<HasSql<boolean>>
): Relation<Table<Definition, Name>, 'one', never, Name>
export function one<
  Definition extends TableDefinition,
  Name extends string,
  Keys extends RelationKeys<Definition>
>(
  target: Table<Definition, Name>,
  keys: Keys & Checked<Keys, Definition, Name>
): Keyed<'one', Definition, Name, Keys>
export function one(target: Table, ...on: Array<unknown>) {
  return relation(true, target, on)
}
