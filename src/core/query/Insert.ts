import {
  type HasSql,
  getData,
  getTable,
  hasSql,
  internalData,
  internalQuery,
  internalSelection
} from '../Internal.ts'
import type {IsMysql, IsPostgres, IsSqlite, QueryMeta} from '../MetaData.ts'
import {type QueryData, SingleQuery} from '../Query.ts'
import {
  type Selection,
  type SelectionInput,
  type SelectionRow,
  selection
} from '../Selection.ts'
import {type Sql, sql} from '../Sql.ts'
import type {
  TableApi,
  TableDefinition,
  TableInsert,
  TableRow,
  TableUpdate
} from '../Table.ts'
import {type Input, input} from '../expr/Input.ts'
import {formatCTE} from './CTE.ts'
import type {InsertQuery, SelectQuery} from './Query.ts'
import {selectQuery} from './Select.ts'

export class Insert<
  Returning,
  Meta extends QueryMeta = QueryMeta
> extends SingleQuery<Returning, Meta> {
  readonly [internalData]: QueryData<Meta> & InsertQuery
  declare readonly [internalSelection]?: Selection

  constructor(data: QueryData<Meta> & InsertQuery) {
    super(data)
    this[internalData] = data
    if (data.returning) this[internalSelection] = selection(data.returning)
  }

  get [internalQuery](): Sql {
    return insertQuery(getData(this))
  }
}

class InsertCanReturn<
  Definition extends TableDefinition,
  Meta extends QueryMeta
> extends Insert<void, Meta> {
  returning(
    this: InsertCanReturn<Definition, IsPostgres | IsSqlite>
  ): Insert<TableRow<Definition>, Meta>
  returning<Input extends SelectionInput>(
    this: InsertCanReturn<Definition, IsPostgres | IsSqlite>,
    returning: Input
  ): Insert<SelectionRow<Input>, Meta>
  returning(returning?: SelectionInput) {
    const data = getData(this)
    return new Insert({
      ...data,
      returning: returning ?? data.insert
    })
  }
}

export interface OnConflict {
  target: HasSql | Array<HasSql>
  targetWhere?: HasSql<boolean>
}

export interface OnConflictSet<Definition extends TableDefinition> {
  set: TableUpdate<Definition>
}

export interface OnConflictUpdate<Definition extends TableDefinition>
  extends OnConflict,
    OnConflictSet<Definition> {
  setWhere?: HasSql<boolean>
}

class InsertCanConflict<
  Definition extends TableDefinition,
  Meta extends QueryMeta
> extends InsertCanReturn<Definition, Meta> {
  onConflictDoNothing<Meta extends IsPostgres | IsSqlite>(
    this: InsertCanConflict<Definition, Meta>,
    onConflictDoNothing?: OnConflict
  ): InsertCanReturn<Definition, Meta> {
    return new InsertCanReturn({
      ...getData(this),
      onConflictDoNothing
    })
  }

  onConflictDoUpdate<Meta extends IsPostgres | IsSqlite>(
    this: InsertCanConflict<Definition, Meta>,
    onConflict: OnConflictUpdate<Definition>
  ): InsertCanReturn<Definition, Meta> {
    return new InsertCanReturn({
      ...getData(this),
      onConflict
    })
  }

  onDuplicateKeyUpdate<Meta extends IsMysql>(
    this: InsertCanConflict<Definition, Meta>,
    onDuplicateKeyUpdate: OnConflictSet<Definition>
  ): InsertCanReturn<Definition, Meta> {
    return new InsertCanReturn({
      ...getData(this),
      onDuplicateKeyUpdate
    })
  }
}

export class InsertInto<
  Definition extends TableDefinition,
  Meta extends QueryMeta
> {
  [internalData]: QueryData<Meta> & InsertQuery
  constructor(data: QueryData<Meta> & InsertQuery) {
    this[internalData] = data
  }

  values(value: TableInsert<Definition>): InsertCanConflict<Definition, Meta>
  values(
    values: Array<TableInsert<Definition>>
  ): InsertCanConflict<Definition, Meta>
  values(values: TableInsert<Definition> | Array<TableInsert<Definition>>) {
    return new InsertCanConflict({
      ...getData(this),
      values
    })
  }

  select(
    query: SingleQuery<TableRow<Definition>, Meta>
  ): InsertCanConflict<Definition, Meta> {
    return new InsertCanConflict({
      ...getData(this),
      ...getData(query)
    })
  }
}

const defaultKeyword = sql.universal({
  sqlite: sql`null`,
  default: sql`default`
})

function formatValues(
  table: TableApi,
  rows: Array<TableInsert<TableDefinition>>
): Sql {
  return sql.join(
    rows.map((row: Record<string, Input>) => {
      return sql`(${sql.join(
        Object.entries(table.columns).map(([key, column]) => {
          const value = row[key]
          const {$default, mapToDriverValue} = getData(column)
          if (value !== undefined) {
            if (value && typeof value === 'object' && hasSql(value))
              return value
            return input(mapToDriverValue?.(value) ?? value)
          }
          if ($default) return $default()
          return defaultKeyword
        }),
        sql`, `
      )})`
    }),
    sql`, `
  )
}

function formatUpdates(update: TableUpdate<TableDefinition>): Sql {
  return sql.join(
    Object.entries(update).map(
      ([key, value]) => sql`${sql.identifier(key)} = ${input(value)}`
    ),
    sql`, `
  )
}

function formatConflict({
  target,
  targetWhere,
  set,
  setWhere
}: Partial<OnConflictUpdate<TableDefinition>>): Sql {
  const update = set && formatUpdates(set)
  return sql.query({
    onConflict: sql.join([
      target &&
        sql`(${Array.isArray(target) ? sql.join(target, sql`, `) : target})`,
      targetWhere && sql`where ${targetWhere}`,
      update
        ? sql.join([
            sql`do update set ${update}`,
            setWhere && sql`where ${setWhere}`
          ])
        : sql`do nothing`
    ])
  })
}

function formatConflicts(query: InsertQuery): Sql | undefined {
  const {onConflict, onConflictDoNothing, onDuplicateKeyUpdate} = query
  if (onDuplicateKeyUpdate)
    return sql.query({
      onDuplicateKeyUpdate: formatUpdates(onDuplicateKeyUpdate.set)
    })
  if (onConflict) return formatConflict(onConflict)
  if (onConflictDoNothing)
    return formatConflict(
      onConflictDoNothing === true ? {} : onConflictDoNothing
    )
  return undefined
}

export function insertQuery(query: InsertQuery): Sql {
  const {insert, values, select, returning} = query
  if (!values && !select) throw new Error('No values defined')
  const table = getTable(insert)
  const tableName = sql.identifier(table.name)
  const toInsert = values
    ? sql.query({
        values: formatValues(table, Array.isArray(values) ? values : [values])
      })
    : selectQuery(<SelectQuery>query)
  const conflicts = formatConflicts(query)
  return sql
    .query(
      formatCTE(query),
      {insertInto: sql`${tableName}(${table.listColumns()})`},
      toInsert,
      conflicts,
      returning && sql.query({returning: selection(returning)})
    )
    .inlineFields(false)
}
