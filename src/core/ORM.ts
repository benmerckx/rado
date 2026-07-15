import {Builder} from './Builder.ts'
import {count as countExpr} from './expr/Aggregate.ts'
import {and, eq} from './expr/Conditions.ts'
import {Field} from './expr/Field.ts'
import {include, Include} from './expr/Include.ts'
import {
  getData,
  getField,
  getTable,
  HasField,
  HasSql,
  HasTable,
  HasTarget,
  internalTargetAlias
} from './Internal.ts'
import {QueryMeta} from './MetaData.ts'
import {SelectionQuery} from './query/Query.ts'
import {Select, SelectFirst} from './query/Select.ts'
import {SelectionInput, SelectionRow} from './Selection.ts'
import {Sql} from './Sql.ts'
import {alias, Table, TableDefinition, TableFields, TableRow} from './Table.ts'

export type ORMQuery<Input extends SelectionInput = SelectionInput> = Omit<
  SelectionQuery<Input>,
  'from' | 'select'
> & {
  select?: Input
}

export type ModelColumns<Model> = {
  [Key in keyof Model as Key extends string
    ? Model[Key] extends HasSql
      ? Key
      : never
    : never]: Extract<Model[Key], HasSql>
}

export function columns<
  Definition extends TableDefinition,
  Name extends string
>(model: Table<Definition, Name>): TableFields<Definition, Name>
export function columns<Model extends HasTarget & object>(
  model: Model
): ModelColumns<Model>
export function columns(model: HasTarget & object): Record<string, HasSql> {
  const definition = getTable(model as HasTable).columns
  return Object.fromEntries(
    Object.keys(definition).map(name => [
      name,
      (model as unknown as Record<string, HasSql>)[name]
    ])
  )
}

export abstract class ORM<Meta extends QueryMeta> extends Builder<Meta> {
  find<Returning extends SelectionInput>(
    model: HasTarget,
    query: ORMQuery<Returning> & {select: Returning}
  ): Select<Returning, Meta>
  find<Model extends HasTarget & object>(
    model: Model,
    query?: ORMQuery<ModelColumns<Model>>
  ): Select<ModelColumns<Model>, Meta>
  find(
    model: HasTarget & object,
    query: ORMQuery<any> = {}
  ): Select<any, Meta> {
    return new Select({
      ...getData(this),
      ...query,
      from: model,
      select: query.select ?? columns(model)
    })
  }

  first<Returning extends SelectionInput>(
    model: HasTarget,
    query: ORMQuery<Returning> & {select: Returning}
  ): SelectFirst<Returning, Meta, true>
  first<Model extends HasTarget & object>(
    model: Model,
    query?: ORMQuery<ModelColumns<Model>>
  ): SelectFirst<ModelColumns<Model>, Meta, true>
  first(
    model: HasTarget & object,
    query: ORMQuery<any> = {}
  ): SelectFirst<any, Meta, true> {
    return new SelectFirst<any, Meta, true>({
      ...getData(this),
      ...query,
      from: model,
      select: query.select ?? columns(model)
    })
  }

  count(
    model: HasTarget,
    query: {where?: HasSql<boolean>} = {}
  ): SelectFirst<Sql<number>, Meta> {
    return new SelectFirst({
      ...getData(this),
      from: model,
      select: countExpr(),
      where: query.where
    })
  }
}

export interface RelationOptions<FromName extends string = string> {
  from: HasSql & HasField & Field<unknown, FromName>
  to: HasSql
  alias?: string
}

type RelationQueryFactory<
  Definition extends TableDefinition,
  Input extends SelectionInput
> = (parent: TableFields<Definition>) => ORMQuery<Input>

type SelfRelationQueryFactory<
  Definition extends TableDefinition,
  TargetName extends string,
  FromName extends string,
  Input extends SelectionInput
> = [FromName] extends [TargetName]
  ? RelationQueryFactory<Definition, Input>
  : never

export interface ManyRelation<
  Definition extends TableDefinition,
  TargetName extends string,
  FromName extends string
> {
  (): Include<Array<TableRow<Definition>>>
  (
    query: ORMQuery<TableFields<Definition, TargetName>>
  ): Include<Array<TableRow<Definition>>>
  <Input extends SelectionInput>(
    query: ORMQuery<Input> & {select: Input}
  ): Include<Array<SelectionRow<Input>>>
  <Input extends SelectionInput>(
    query: SelfRelationQueryFactory<Definition, TargetName, FromName, Input>
  ): Include<Array<SelectionRow<Input>>>
}

export interface OneRelation<
  Definition extends TableDefinition,
  TargetName extends string,
  FromName extends string
> {
  (): Include<TableRow<Definition> | null>
  (
    query: ORMQuery<TableFields<Definition, TargetName>>
  ): Include<TableRow<Definition> | null>
  <Input extends SelectionInput>(
    query: ORMQuery<Input> & {select: Input}
  ): Include<SelectionRow<Input> | null>
  <Input extends SelectionInput>(
    query: SelfRelationQueryFactory<Definition, TargetName, FromName, Input>
  ): Include<SelectionRow<Input> | null>
}

let relationId = 0

function relationAlias(): string {
  relationId += 1
  return `__rado_relation_${relationId}`
}

function parentFields<Definition extends TableDefinition>(
  target: Table<Definition>
): TableFields<Definition> {
  return Object.fromEntries(
    Object.entries(columns(target)).map(([name, value]) => {
      const field = getField(value)
      return [name, new Field(Sql.SELF_TARGET, field.fieldName, field.source)]
    })
  ) as TableFields<Definition>
}

function relationSource(from: HasSql & HasField, targetName: string): HasSql {
  const field = getField(from)
  if (field.targetName !== targetName) return from
  return new Field(Sql.SELF_TARGET, field.fieldName, field.source)
}

function relation<
  Kind extends 'one' | 'many',
  Definition extends TableDefinition,
  TargetName extends string,
  FromName extends string
>(
  kind: Kind,
  target: Table<Definition, TargetName>,
  options: RelationOptions<FromName>
): Kind extends 'one'
  ? OneRelation<Definition, TargetName, FromName>
  : ManyRelation<Definition, TargetName, FromName> {
  const targetName = getTable(target).aliased
  const sourceName = getField(options.from).targetName
  const parent = parentFields(target)
  let invocationId = 0

  const build = (input?: ORMQuery | RelationQueryFactory<Definition, any>) => {
    if (typeof input === 'function' && sourceName !== targetName)
      throw new Error(
        'Relation callbacks are only available for self-relations'
      )
    const query = typeof input === 'function' ? input(parent) : (input ?? {})
    invocationId += 1
    const name = options.alias
      ? invocationId === 1
        ? options.alias
        : `${options.alias}_${invocationId}`
      : relationAlias()
    const relationTarget = alias(target, name)
    const select = query.select ?? columns(target)
    const data = {
      ...query,
      from: relationTarget,
      select,
      where: and(
        eq(options.to, relationSource(options.from, targetName)),
        query.where
      ),
      [internalTargetAlias]: {
        sourceName: targetName,
        name,
        selfName: sourceName
      }
    }
    const scoped = new Select(data)
    return kind === 'one' ? include.one(scoped) : include(scoped)
  }

  return build as Kind extends 'one'
    ? OneRelation<Definition, TargetName, FromName>
    : ManyRelation<Definition, TargetName, FromName>
}

export function one<
  Definition extends TableDefinition,
  TargetName extends string,
  FromName extends string
>(
  target: Table<Definition, TargetName>,
  options: RelationOptions<FromName>
): OneRelation<Definition, TargetName, FromName> {
  return relation('one', target, options)
}

export function many<
  Definition extends TableDefinition,
  TargetName extends string,
  FromName extends string
>(
  target: Table<Definition, TargetName>,
  options: RelationOptions<FromName>
): ManyRelation<Definition, TargetName, FromName> {
  return relation('many', target, options)
}
