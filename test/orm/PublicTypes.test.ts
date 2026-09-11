import {suite} from '@alinea/suite'
import {Column, column} from '#/core/Column.ts'
import type {Database} from '#/core/Database.ts'
import {getData} from '#/core/Internal.ts'
import type {Sync} from '#/core/MetaData.ts'
import {
  ManyRelation,
  ModelWrite,
  ModelWriteStart,
  OneRelation,
  type ManyRelationOptions,
  type ORMQuery,
  type RelationFields,
  type RelationOptions,
  type RelationPredicateQuery,
  type RelationThrough,
  many,
  one
} from '#/core/ORM.ts'
import {table} from '#/core/Table.ts'
import {id} from '#/universal.ts'
import {Callable} from '#/util/Callable.ts'

const typecheck = (_run: () => void) => {}

suite(import.meta, test => {
  test('ORM public constructor and write constraints', () => {
    typecheck(() => {
      const db: Database<Sync<'sqlite'>> = undefined!
      const strict = table('strict', {
        id: id(),
        title: new Column<string, [false, true]>({
          type: column.text(),
          notNull: true
        })
      })
      const Strict = {
        ...strict,
        related: many(strict, {from: strict.id, to: strict.id})
      }
      // @ts-expect-error required insert columns must remain required
      db.write(Strict).insert({})
      // @ts-expect-error required related insert columns must remain required
      db.write(Strict).where(undefined!).insert(Strict.related, {})
      const start: ModelWriteStart<typeof Strict, Sync<'sqlite'>> = db.write(
        Strict
      )
      const plan: ModelWrite<
        typeof Strict,
        Sync<'sqlite'>,
        true,
        'root'
      > = start.insert({title: 'A'})
      plan.returning()
      getData(start).model
      getData(plan).instruction
      getData(plan).prev
      // @ts-expect-error plan state is accessible only through internalData
      plan.prev
      // @ts-expect-error plan state does not occupy public API names
      plan.instruction
      // @ts-expect-error start state is accessible only through internalData
      start.model
      // @ts-expect-error an inserted root cannot also be updated in the same segment
      plan.update({title: 'B'})
      // @ts-expect-error an inserted root cannot also be deleted in the same segment
      plan.delete()
      const outsider = table('outsider', {id: id()})
      const Foreign = {
        ...strict,
        outsiders: many(outsider, {from: strict.id, to: outsider.id})
      }
      // @ts-expect-error a relation must belong to the current model's relation surface
      db.write(Strict).where(undefined!).insert(Foreign.outsiders, {})

      const relationFields: RelationFields<'strict'> = strict.id
      const options: RelationOptions<'strict', true> = {
        from: relationFields,
        to: strict.id,
        required: true
      }
      const manyOptions: ManyRelationOptions<'strict'> = {
        from: relationFields,
        to: strict.id
      }
      const through: RelationThrough = {
        table: strict,
        from: strict.id,
        to: strict.id
      }
      const predicates: RelationPredicateQuery = {}
      const query = {
        select: {title: strict.title}
      } satisfies ORMQuery<{title: typeof strict.title}>
      db.find(Strict, query)
      const oneRelation = new OneRelation<typeof strict, 'strict', true>(
        strict,
        options
      )
      const manyRelation = new ManyRelation<typeof strict, 'strict'>(strict, {
        ...manyOptions,
        through
      })
      oneRelation(predicates)
      manyRelation(predicates)
      const callable: Callable = manyRelation
      const fieldNames = table('field_names', {
        name: id(),
        length: id(),
        call: id(),
        apply: id(),
        include: id(),
        query: id()
      })
      const relation = many(fieldNames, {from: strict.id, to: fieldNames.name})
      db.select({
        name: relation.name,
        length: relation.length,
        call: relation.call,
        apply: relation.apply,
        include: relation.include,
        query: relation.query
      })
      one(strict, options)(predicates)

      const derived = db
        .select({title: strict.title})
        .from(strict)
        .as('derived')
      db.find(derived)
      db.first(derived)
      db.count(derived)
    })
  })
})
