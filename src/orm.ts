// ORM API sketch — type-level only, no implementation yet.
//
// Design notes:
// - A "model" is a plain spread of a table plus relation pointers:
//     const User = {...users, posts: many(posts)}
//   The spread keeps the table's symbol-keyed metadata, so a model is still a
//   fully working Table (select/join/where) and every column field passes
//   through: User.name is the same Field as users.name. Application code only
//   ever needs the model identifier; tables can stay module-private.
// - No registry: every function takes the Database as first argument and is
//   typed locally by the model argument. Works with transactions for free
//   since Transaction extends Database.
// - Loading relations is unified with shaping: relation pointers appear
//   directly in select shapes and can be refined with
//   .select/.where/.orderBy/.limit. `select: {...User}` means "all columns +
//   all relations", `select: columns(User)` means columns only.
// - Writes are explicit and immutable: each op (set/unset/increment/add/
//   remove) returns a new object with pending ops recorded; save() executes
//   them (plus nested relation writes) in one transaction.
//
// Planned core change (not done here): make the internalCreate/internalDrop
// getters on table objects non-enumerable so spreading a table does not
// eagerly evaluate DDL. See src/core/Table.ts.
//
// Possible later integration: get/find/first/count are small enough to live
// as methods on Database itself (db.find({from: User, ...})), which would
// drop the db argument. Kept as a standalone add-on for now so the core
// stays ORM-free and the module remains tree-shakeable; revisit once the
// API has settled.

import type {Column, Nullability} from './core/Column.ts'
import type {Database} from './core/Database.ts'
import type {Input} from './core/expr/Input.ts'
import type {HasSql, HasTable} from './core/Internal.ts'
import type {
  Table,
  TableDefinition,
  TableInsert,
  TableUpdate
} from './core/Table.ts'
import type {Expand} from './core/Types.ts'

declare const relation: unique symbol

// ── Relations ──────────────────────────────────────────────────────────────

export type OnRemove = 'delete' | 'detach' | 'ignore'

export interface RelationConfig {
  /** Local fields of the FK. Inferred from references() when omitted. */
  fields?: Array<HasSql>
  /** Foreign fields the FK points at. Inferred when omitted. */
  references?: Array<HasSql>
}

export interface ManyConfig extends RelationConfig {
  /** Junction table for many-to-many. */
  through?: Table
  /**
   * What happens to related rows missing from a reconciling Ops.set:
   * delete the row, detach it (null the FK / delete the junction row),
   * or ignore (default — arrays are merge-only).
   */
  onRemove?: OnRemove
}

/** Any value allowed inside a relation/select shape. */
export type Shape =
  | HasSql
  | Table
  | One<any, any>
  | Many<any, any>
  | {[key: string]: Shape}

interface RelationBase<
  Def extends TableDefinition,
  Card extends 'one' | 'many',
  Shaped
> {
  readonly [relation]: {def: Def; card: Card; shape: Shaped}
  where(...conditions: Array<HasSql<boolean>>): this
  orderBy(...order: Array<HasSql>): this
  limit(count: number): this
  offset(count: number): this
}

export interface One<
  Def extends TableDefinition = TableDefinition,
  Shaped = Table<Def>
> extends RelationBase<Def, 'one', Shaped> {
  /** Shape the related row: author.select({name: User.name}) */
  select<S extends Shape>(shape: S): One<Def, S>
  /** Use as a where condition on the parent: exists(correlated subquery) */
  exists(): HasSql<boolean>
}

export interface Many<
  Def extends TableDefinition = TableDefinition,
  Shaped = Table<Def>
> extends RelationBase<Def, 'many', Shaped> {
  /** Shape the related rows: posts.select({title: Post.title}) */
  select<S extends Shape>(shape: S): Many<Def, S>
  /** Correlated count, usable in select shapes */
  count(): HasSql<number>
  /** Parent filter: at least one related row matches */
  some(...conditions: Array<HasSql<boolean>>): HasSql<boolean>
  /** Parent filter: no related row matches */
  none(...conditions: Array<HasSql<boolean>>): HasSql<boolean>
}

/** To-one relation. FK lives on the declaring table, inferred via references(). */
export declare function one<Def extends TableDefinition>(
  target: Table<Def>,
  config?: RelationConfig
): One<Def>

/** To-many relation. FK lives on the target (or on `through` for m2m). */
export declare function many<Def extends TableDefinition>(
  target: Table<Def>,
  config?: ManyConfig
): Many<Def>

// ── Models ─────────────────────────────────────────────────────────────────

/** A model is a table carrying extra relation pointers. */
export type Model = HasTable

export type ModelDefinition<M> =
  M extends HasTable<infer Def, string> ? Def : never

/** Row type of a definition, accounting for column nullability. */
type RowOf<Def extends TableDefinition> = {
  [K in keyof Def]: Def[K] extends Column<
    infer T,
    [infer AllowsNull extends boolean, boolean]
  >
    ? [AllowsNull] extends [false]
      ? T
      : T | null
    : never
}

/** Columns-only row of a model (no relations). */
export type ModelRow<M> = Expand<RowOf<ModelDefinition<M>>>

type RelationsOf<M> = {
  [K in keyof M as M[K] extends One<any, any> | Many<any, any>
    ? K
    : never]: M[K]
}

/** Columns-only shape of a model (relations and metadata excluded). */
export type ModelColumns<M> = {
  [K in keyof M as M[K] extends One<any, any> | Many<any, any>
    ? never
    : K extends string
      ? K
      : never]: M[K]
}

/**
 * Columns-only select shape, so partial selects never need the underlying
 * table: select: {...columns(User), extra: sql`...`}
 */
export declare function columns<M extends Model>(model: M): ModelColumns<M>

// ── Reading ────────────────────────────────────────────────────────────────

/**
 * Resolves a select shape to a row type. Relation pointers resolve to nested
 * rows of their (possibly refined) shape.
 */
export type ShapeRow<In> =
  In extends Many<any, infer S>
    ? Array<ShapeRow<S>>
    : In extends One<any, infer S>
      ? ShapeRow<S> | null
      : In extends HasSql<infer Value>
        ? Value
        : In extends object
          ? Expand<{
              [K in keyof In as K extends string ? K : never]: ShapeRow<In[K]>
            }>
          : never

export interface FindOptions<M extends Model, S extends Shape | undefined> {
  /** The model (or plain table) to query. */
  from: M
  select?: S
  where?: HasSql<boolean> | Array<HasSql<boolean>>
  orderBy?: HasSql | Array<HasSql>
  limit?: number
  offset?: number
}

export interface GetOptions<M extends Model, S extends Shape | undefined> {
  from: M
  /** Primary key value to look up. */
  id: Input<number | string>
  select?: S
}

type ResultOf<M, S> = [S] extends [undefined] ? ModelRow<M> : ShapeRow<S>

/** Fetch a single row by primary key. */
export declare function get<
  M extends Model,
  S extends Shape | undefined = undefined
>(db: Database, options: GetOptions<M, S>): Promise<ResultOf<M, S> | null>

/** Fetch many rows. drizzle: db.query.x.findMany */
export declare function find<
  M extends Model,
  S extends Shape | undefined = undefined
>(db: Database, options: FindOptions<M, S>): Promise<Array<ResultOf<M, S>>>

/** find with limit 1. drizzle: findFirst */
export declare function first<
  M extends Model,
  S extends Shape | undefined = undefined
>(db: Database, options: FindOptions<M, S>): Promise<ResultOf<M, S> | null>

/** Count rows matching the filter. Pairs with find for pagination. */
export declare function count<M extends Model>(
  db: Database,
  options: Pick<FindOptions<M, undefined>, 'from' | 'where'>
): Promise<number>

// ── Writing ────────────────────────────────────────────────────────────────

/**
 * A row in a save graph: either a new row (no pk → INSERT) or an existing
 * row (pk present → UPDATE of the given fields).
 */
type GraphRow<Def extends TableDefinition> = TableInsert<Def> | TableUpdate<Def>

/** Insert/update graph for a model: columns + nested relation rows. */
export type Graph<M> = GraphRow<ModelDefinition<M>> & {
  readonly [K in keyof RelationsOf<M>]?: RelationsOf<M>[K] extends Many<
    infer Def,
    any
  >
    ? Array<GraphRow<Def>>
    : RelationsOf<M>[K] extends One<infer Def, any>
      ? GraphRow<Def> | null
      : never
}

/** save() resolves with clean persisted rows for everything it touched. */
export type Persisted<M, In> = Expand<
  ModelRow<M> & {
    [K in Extract<
      keyof In,
      keyof RelationsOf<M>
    >]: RelationsOf<M>[K] extends Many<infer Def, any>
      ? Array<Expand<RowOf<Def>>>
      : RelationsOf<M>[K] extends One<infer Def, any>
        ? Expand<RowOf<Def>> | null
        : never
  }
>

/**
 * Smart save:
 * - pk absent → INSERT, pk present → UPDATE (only fields that were set)
 * - pk present but no matching row → the transaction fails with an error;
 *   save never silently inserts a row with an explicit pk. Deliberate
 *   upserts go through the query builder (onConflictDoUpdate), as in drizzle
 * - relation rows are saved recursively; FKs are wired automatically
 * - statements ordered by FK dependency and run in a single transaction
 * - m2m saves insert junction rows; onRemove governs reconciliation
 * - resolves with a new immutable object: ids and defaults filled in,
 *   pending ops cleared; the input object is untouched
 */
export declare function save<M extends Model, In extends Graph<M>>(
  db: Database,
  model: M,
  input: In
): Promise<Persisted<M, In>>

/** Save several graphs in one transaction (seeding, imports). */
export declare function saveMany<M extends Model, In extends Graph<M>>(
  db: Database,
  model: M,
  inputs: Array<In>
): Promise<Array<Persisted<M, In>>>

/**
 * Delete by entity or primary key.
 *
 * Deletion does not cascade at the ORM level: like drizzle, related rows are
 * governed by the referential actions declared on the schema via
 * references(…, {onDelete}). Relation onRemove only applies to reconciliation
 * during save(); it plays no role here.
 */
export declare function destroy<M extends Model>(
  db: Database,
  model: M,
  entity: Input<number | string> | Partial<ModelRow<M>>
): Promise<void>

// ── Update operations (immutable) ────────────────────────────────────────────

/** Overwrite scalar fields. */
export declare function set<E extends object>(entity: E, values: Partial<E>): E
/** Reconcile a to-many relation to exactly these rows (honors onRemove). */
export declare function set<E extends object, Def extends TableDefinition>(
  entity: E,
  relation: Many<Def, any>,
  rows: Array<GraphRow<Def>>
): E
/** Set or detach (null) a to-one relation. */
export declare function set<E extends object, Def extends TableDefinition>(
  entity: E,
  relation: One<Def, any>,
  row: GraphRow<Def> | null
): E

/** Clear a field (set to null). Field pointer, not a string. */
export declare function unset<E extends object>(entity: E, field: HasSql): E

/** Atomic increment: SET n = n + by, no read required. */
export declare function increment<E extends object>(
  entity: E,
  field: HasSql<number> | HasSql<number | null>,
  by?: number
): E

/** Add a row to a to-many relation (insert or reparent/update). */
export declare function add<E extends object, Def extends TableDefinition>(
  entity: E,
  relation: Many<Def, any>,
  row: GraphRow<Def>
): E

/** Remove a row from a to-many relation (honors onRemove). */
export declare function remove<E extends object, Def extends TableDefinition>(
  entity: E,
  relation: Many<Def, any>,
  row: GraphRow<Def>
): E

// ── Open questions ─────────────────────────────────────────────────────────
// - pk visibility: GraphRow = TableInsert | TableUpdate lets a typo'd insert
//   typecheck as an "update". get()'s id is also untyped against the actual
//   pk column and composite pks are not representable. All fixable by
//   branding primaryKey() in Column's type parameters (core change).
// - unset/increment accept any HasSql; should be narrowed to fields of the
//   entity's own model once entities carry their model type.
// - reads use an options object ({from, select}) while writes are positional
//   (save(db, model, input)); harmonize before implementing.
