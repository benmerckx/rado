import {
  type HasSql,
  type HasTable,
  getData,
  getQuery,
  getTable,
  internalData,
  internalQuery,
  internalSelection
} from '../Internal.ts'
import type {IsPostgres, IsSqlite, QueryMeta} from '../MetaData.ts'
import {Query, type QueryData} from '../Query.ts'
import {
  type Selection,
  type SelectionInput,
  type SelectionRow,
  selection
} from '../Selection.ts'
import {type Sql, sql} from '../Sql.ts'
import type {
  TableDefinition,
  TableInsert,
  TableRow,
  TableUpdate
} from '../Table.ts'
import {type Input, input} from '../expr/Input.ts'

interface InsertIntoData<Meta extends QueryMeta> extends QueryData<Meta> {
  into: HasTable
  values?: HasSql
  select?: HasSql
}

export interface InsertData<Meta extends QueryMeta>
  extends InsertIntoData<Meta> {
  returning?: Selection
  onConflict?: HasSql
}

export class Insert<Result, Meta extends QueryMeta = QueryMeta> extends Query<
  Result,
  Meta
> {
  readonly [internalData]: InsertData<Meta>
  declare readonly [internalSelection]?: Selection

  constructor(data: InsertData<Meta>) {
    super(data)
    this[internalData] = data
    if (data.returning) this[internalSelection] = data.returning
  }

  get [internalQuery](): Sql {
    return sql.chunk('emitInsert', this)
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
      returning: selection(returning ?? data.into)
    })
  }
}

export interface OnConflict {
  target: HasSql | Array<HasSql>
  targetWhere?: HasSql<boolean>
}

export interface OnConflictUpdate<Definition extends TableDefinition>
  extends OnConflict {
  set: TableUpdate<Definition>
  setWhere?: HasSql<boolean>
}

class InsertCanConflict<
  Definition extends TableDefinition,
  Meta extends QueryMeta
> extends InsertCanReturn<Definition, Meta> {
  onConflictDoNothing(
    this: InsertCanConflict<Definition, IsPostgres>,
    onConflict?: OnConflict
  ): InsertCanReturn<Definition, Meta> {
    return <InsertCanConflict<Definition, Meta>>(
      this.#onConflict(onConflict ?? {})
    )
  }

  onConflictDoUpdate(
    this: InsertCanConflict<Definition, IsPostgres>,
    onConflict: OnConflictUpdate<Definition>
  ): InsertCanReturn<Definition, Meta> {
    return <InsertCanConflict<Definition, Meta>>this.#onConflict(onConflict)
  }

  #onConflict({
    target,
    targetWhere,
    set,
    setWhere
  }: Partial<OnConflictUpdate<Definition>>): InsertCanReturn<Definition, Meta> {
    const update =
      set &&
      sql.join(
        Object.entries(set).map(
          ([key, value]) => sql`${sql.identifier(key)} = ${input(value)}`
        ),
        sql`, `
      )
    return new InsertCanReturn({
      ...getData(this),
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
}

const defaultKeyword = sql.universal({
  sqlite: sql`null`,
  default: sql`default`
})

export class InsertInto<
  Definition extends TableDefinition,
  Meta extends QueryMeta
> {
  [internalData]: InsertData<Meta>
  constructor(data: InsertData<Meta>) {
    this[internalData] = data
  }

  values(value: TableInsert<Definition>): InsertCanConflict<Definition, Meta>
  values(
    values: Array<TableInsert<Definition>>
  ): InsertCanConflict<Definition, Meta>
  values(insert: TableInsert<Definition> | Array<TableInsert<Definition>>) {
    const {into} = getData(this)
    const rows = Array.isArray(insert) ? insert : [insert]
    const table = getTable(into)
    const values = sql.join(
      rows.map((row: Record<string, Input>) => {
        return sql`(${sql.join(
          Object.entries(table.columns).map(([key, column]) => {
            const value = row[key]
            const {defaultValue, mapToDriverValue} = getData(column)
            if (value !== undefined)
              return input(mapToDriverValue?.(value) ?? value)
            if (defaultValue) return defaultValue()
            return defaultKeyword
          }),
          sql`, `
        )})`
      }),
      sql`, `
    )
    return new InsertCanConflict<Definition, Meta>({...getData(this), values})
  }

  select(
    query: Query<TableRow<Definition>, Meta>
  ): InsertCanConflict<Definition, Meta> {
    return new InsertCanConflict({
      ...getData(this),
      select: getQuery(query)
    })
  }
}
