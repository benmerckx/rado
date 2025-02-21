import {
  type HasQuery,
  getData,
  getTable,
  internalData,
  internalQuery,
  internalSelection
} from '../Internal.ts'
import type {IsMysql, IsPostgres, IsSqlite, QueryMeta} from '../MetaData.ts'
import {type QueryData, SingleQuery} from '../Queries.ts'
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
import type {
  Conflict,
  InsertQuery,
  OnConflict,
  OnConflictSet,
  OnConflictUpdate,
  SelectQuery
} from './Query.ts'
import {selectQuery} from './Select.ts'
import {formatModifiers, mapToColumn} from './Shared.ts'

export class Insert<Result, Meta extends QueryMeta = QueryMeta>
  extends SingleQuery<Result, Meta>
  implements HasQuery<Result>
{
  readonly [internalData]: QueryData<Meta> & InsertQuery
  declare readonly [internalSelection]?: Selection

  constructor(data: QueryData<Meta> & InsertQuery) {
    super(data)
    this[internalData] = data
    if (data.returning) this[internalSelection] = selection(data.returning)
  }

  get [internalQuery](): Sql<Result> {
    return insertQuery(getData(this)) as Sql<Result>
  }
}

class InsertCanReturn<
  Definition extends TableDefinition,
  Meta extends QueryMeta
> extends Insert<void, Meta> {
  returning<Meta extends IsPostgres | IsSqlite>(
    this: InsertCanReturn<Definition, Meta>
  ): Insert<Array<TableRow<Definition>>, Meta>
  returning<Input extends SelectionInput, Meta extends IsPostgres | IsSqlite>(
    this: InsertCanReturn<Definition, Meta>,
    returning: Input
  ): Insert<Array<SelectionRow<Input>>, Meta>
  returning(returning?: SelectionInput) {
    const data = getData(this)
    return new Insert({
      ...data,
      returning: returning ?? data.insert
    })
  }
}

class InsertCanConflict<
  Definition extends TableDefinition,
  Meta extends QueryMeta
> extends InsertCanReturn<Definition, Meta> {
  onConflictDoNothing<Meta extends IsPostgres | IsSqlite>(
    this: InsertCanConflict<Definition, Meta>,
    onConflictDoNothing?: OnConflict
  ): InsertCanConflict<Definition, Meta> {
    const {on = [], ...data} = getData(this)
    return new InsertCanConflict({
      ...data,
      on: [...on, {conflictDoNothing: onConflictDoNothing ?? true}]
    })
  }

  onConflictDoUpdate<Meta extends IsPostgres | IsSqlite>(
    this: InsertCanConflict<Definition, Meta>,
    onConflict: OnConflictUpdate<Definition>
  ): InsertCanConflict<Definition, Meta> {
    const {on = [], ...data} = getData(this)
    return new InsertCanConflict({
      ...data,
      on: [...on, {conflictDoUpdate: onConflict}]
    })
  }

  onDuplicateKeyUpdate<Meta extends IsMysql>(
    this: InsertCanConflict<Definition, Meta>,
    onDuplicateKeyUpdate: OnConflictSet<Definition>
  ): InsertCanConflict<Definition, Meta> {
    const {on = [], ...data} = getData(this)
    return new InsertCanConflict({
      ...data,
      on: [...on, {duplicateKeyUpdate: onDuplicateKeyUpdate}]
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
    query: SingleQuery<Array<TableRow<Definition>>, Meta>
  ): InsertCanConflict<Definition, Meta> {
    return new InsertCanConflict({
      ...getData(this),
      ...getData(query)
    })
  }
}

function formatDefaultValue(value: Sql): Sql {
  return sql.universal({
    sqlite: value,
    default: sql`default`
  })
}

function formatValues(
  table: TableApi,
  rows: Array<TableInsert<TableDefinition>>
): Sql {
  return sql.join(
    rows.map((row: Record<string, Input>) => {
      return sql`(${sql.join(
        Object.entries(table.columns).map(([key, column]) => {
          const expr = row[key]
          const columnApi = getData(column)
          const {$onUpdate, $default, defaultValue} = columnApi
          if (expr !== undefined) return mapToColumn(columnApi, expr)
          if ($default) return $default()
          if (defaultValue) return formatDefaultValue(defaultValue)
          if ($onUpdate) return $onUpdate()
          return sql`null`
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
  where: setWhere
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

function formatConflicts(on: Array<Conflict>): Sql | undefined {
  return sql.join(
    on.map(conflict => {
      if ('duplicateKeyUpdate' in conflict)
        return sql.query({
          onDuplicateKeyUpdate: formatUpdates(conflict.duplicateKeyUpdate.set)
        })
      if ('conflictDoUpdate' in conflict)
        return formatConflict(conflict.conflictDoUpdate)
      if ('conflictDoNothing' in conflict)
        return formatConflict(
          conflict.conflictDoNothing === true ? {} : conflict.conflictDoNothing
        )
      throw new Error('Unknown conflict type')
    })
  )
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
  const conflicts = query.on ? formatConflicts(query.on) : undefined
  return sql
    .query(
      formatCTE(query),
      {insertInto: sql`${tableName} (${table.listColumns()})`},
      toInsert,
      conflicts,
      returning && sql.query({returning: selection(returning)}),
      formatModifiers(query)
    )
    .inlineFields(false)
}
