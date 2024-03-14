import {Action, ColumnData, ColumnType} from '../define/Column.js'
import {BinOpType, Expr, ExprData, ExprType, UnOpType} from '../define/Expr.js'
import {OrderBy, OrderDirection} from '../define/OrderBy.js'
import {ParamType} from '../define/Param.js'
import {QueryData, QueryType} from '../define/Query.js'
import {Target, TargetType} from '../define/Target.js'
import {Sanitizer} from './Sanitizer.js'
import {Statement, StatementOptions} from './Statement.js'

const binOps = {
  [BinOpType.Add]: '+',
  [BinOpType.Subt]: '-',
  [BinOpType.Mult]: '*',
  [BinOpType.Mod]: '%',
  [BinOpType.Div]: '/',
  [BinOpType.Greater]: '>',
  [BinOpType.GreaterOrEqual]: '>=',
  [BinOpType.Less]: '<',
  [BinOpType.LessOrEqual]: '<=',
  [BinOpType.Equals]: '=',
  [BinOpType.NotEquals]: '!=',
  [BinOpType.And]: 'AND',
  [BinOpType.Or]: 'OR',
  [BinOpType.Like]: 'LIKE',
  [BinOpType.Glob]: 'GLOB',
  [BinOpType.Match]: 'MATCH',
  [BinOpType.In]: 'IN',
  [BinOpType.NotIn]: 'NOT IN',
  [BinOpType.Concat]: '||',
  [BinOpType.Collate]: 'COLLATE'
}

const joins = {
  left: 'LEFT',
  inner: 'INNER'
}

const unions = {
  [QueryData.UnionOperation.Union]: 'UNION',
  [QueryData.UnionOperation.UnionAll]: 'UNION ALL',
  [QueryData.UnionOperation.Intersect]: 'INTERSECT',
  [QueryData.UnionOperation.Except]: 'EXCEPT'
}

const actions = {
  [Action.NoAction]: 'NO ACTION',
  [Action.Restrict]: 'RESTRICT',
  [Action.Cascade]: 'CASCADE',
  [Action.SetNull]: 'SET NULL',
  [Action.SetDefault]: 'SET DEFAULT'
}

export interface FormatContext {
  stmt: Statement
  nameResult?: string
  /** Skip prefixing fields with their table name */
  skipTableName?: boolean
  /**
   * In SQLite table names are used as expressions in the FTS5 plugin.
   * To distinguish between formatting a row of the table and just the table name
   * this flag can be used.
   **/
  tableAsExpr?: boolean
  /** Inline all parameters */
  forceInline?: boolean
  formatAsJson?: boolean
  formatAsInsert?: boolean
  topLevel?: boolean
  selectAsColumns?: boolean
  formattingCte?: string
}

type FormatSubject = (stmt: Statement, mkSubject: () => void) => void

function formatAsResultObject(stmt: Statement, mkSubject: () => void) {
  stmt.raw("json_object('result', ")
  mkSubject()
  stmt.raw(')')
}

export interface CompileOptions
  extends Partial<FormatContext>,
    StatementOptions {}

export abstract class Formatter implements Sanitizer {
  constructor() {}

  abstract escapeValue(value: any): string
  abstract escapeIdentifier(ident: string): string
  abstract formatParamValue(paramValue: any): any
  abstract formatAccess(
    ctx: FormatContext,
    mkSubject: () => void,
    field: string
  ): Statement

  compile(query: QueryData, options?: CompileOptions): Statement {
    const result = this.format(
      this.createContext({topLevel: true, ...options}),
      query
    )
    // console.log(result.sql)
    return result
  }

  createContext(options?: CompileOptions) {
    return {stmt: new Statement(this, options), ...options}
  }

  format(ctx: FormatContext, query: QueryData): Statement {
    switch (query.type) {
      case QueryType.Select:
        return this.formatSelect(ctx, query)
      case QueryType.Union:
        return this.formatUnion(ctx, query)
      case QueryType.Insert:
        return this.formatInsert(ctx, query)
      case QueryType.Update:
        return this.formatUpdate(ctx, query)
      case QueryType.Delete:
        return this.formatDelete(ctx, query)
      case QueryType.CreateTable:
        return this.formatCreateTable(ctx, query)
      case QueryType.AlterTable:
        return this.formatAlterTable(ctx, query)
      case QueryType.DropTable:
        return this.formatDropTable(ctx, query)
      case QueryType.CreateIndex:
        return this.formatCreateIndex(ctx, query)
      case QueryType.DropIndex:
        return this.formatDropIndex(ctx, query)
      case QueryType.Transaction:
        return this.formatTransaction(ctx, query)
      case QueryType.Batch:
        return this.formatBatch(ctx, query)
      case QueryType.Raw:
        return this.formatRaw(ctx, query)
    }
  }

  formatSelect(
    {topLevel, ...ctx}: FormatContext,
    query: QueryData.Select
  ): Statement {
    const {stmt} = ctx
    switch (query.from?.type) {
      case TargetType.CTE:
        if (ctx.formattingCte !== query.from.name) {
          stmt
            .add('WITH RECURSIVE')
            .addIdentifier(query.from.name)
            .add('AS')
            .space()
            .openParenthesis()
          this.formatUnion(
            {
              ...ctx,
              topLevel: false,
              selectAsColumns: true,
              formattingCte: query.from.name
            },
            query.from.union
          )
          stmt.closeParenthesis().space()
        }
      default:
        stmt.raw('SELECT').space()
        this.formatSelection(
          ctx,
          query.selection,
          topLevel ? formatAsResultObject : undefined
        )
        if (query.from) {
          stmt.addLine('FROM').space()
          this.formatTarget(ctx, query.from)
        }
        this.formatWhere(ctx, query.where)
        this.formatGroupBy(ctx, query.groupBy)
        this.formatHaving(ctx, query.having)
        this.formatOrderBy(ctx, query.orderBy)
        this.formatLimit(ctx, query)
        return stmt
    }
  }

  formatUnion(
    ctx: FormatContext,
    {a, operator, b}: QueryData.Union
  ): Statement {
    const {stmt} = ctx
    this.format(ctx, a)
    stmt.add(unions[operator]).space()
    this.format(ctx, typeof b === 'function' ? b() : b)
    return stmt
  }

  formatInsert(ctx: FormatContext, query: QueryData.Insert): Statement {
    const {stmt} = ctx
    const columns = Object.values(query.into.columns).map(c => c.name)
    stmt.add('INSERT INTO').addIdentifier(query.into.name)
    if (query.into.alias) stmt.raw('AS').addIdentifier(query.into.alias)
    for (const column of stmt.call(columns)) this.formatString(ctx, column)
    if (query.data) {
      stmt.add('VALUES').space()
      for (const row of stmt.separate(query.data))
        this.formatInsertRow(ctx, query.into.columns, row)
    }
    if (query.select) {
      stmt.space()
      this.formatSelect(
        {
          ...ctx,
          topLevel: false,
          selectAsColumns: true
        },
        query.select
      )
    }
    if (query.selection) {
      stmt.add('RETURNING').space()
      this.formatSelection(ctx, query.selection, formatAsResultObject)
    }
    return stmt
  }

  formatUpdate(
    {topLevel, ...ctx}: FormatContext,
    query: QueryData.Update
  ): Statement {
    const {stmt} = ctx
    const data = query.set || {}
    stmt.add('UPDATE').addIdentifier(query.table.name).add('SET').space()
    const keys = Object.keys(data).filter(key => query.table.columns[key])
    for (const key of stmt.separate(keys)) {
      const column = query.table.columns[key]
      stmt.identifier(key).add('=').space()
      let input = data[key]
      if (Expr.hasExpr(input)) input = input[Expr.ToExpr]()
      if (Expr.isExpr(input))
        this.formatExpr(
          {...ctx, formatAsJson: column.type === ColumnType.Json},
          ExprData.create(data[key])
        )
      else this.formatValue({...ctx, formatAsInsert: true}, input)
    }
    this.formatWhere(ctx, query.where)
    this.formatOrderBy(ctx, query.orderBy)
    this.formatLimit(ctx, query)
    return stmt
  }

  formatDelete(ctx: FormatContext, query: QueryData.Delete): Statement {
    const {stmt} = ctx
    stmt.add('DELETE FROM').addIdentifier(query.table.name)
    this.formatWhere(ctx, query.where)
    this.formatOrderBy(ctx, query.orderBy)
    this.formatLimit(ctx, query)
    return stmt
  }

  formatCreateTable(
    ctx: FormatContext,
    query: QueryData.CreateTable
  ): Statement {
    const {stmt} = ctx
    stmt.add('CREATE TABLE')
    if (query.ifNotExists) stmt.add('IF NOT EXISTS')
    stmt.addIdentifier(query.table.name).space()
    stmt.openParenthesis()
    for (const column of stmt.separate(Object.values(query.table.columns))) {
      this.formatColumn(ctx, column)
    }
    const meta = query.table.meta()
    if (meta.primaryKey) {
      stmt.raw(',').newline().raw('PRIMARY KEY').space()
      for (const expr of stmt.call(meta.primaryKey))
        switch (expr.type) {
          case ExprType.Field:
            stmt.identifier(expr.field)
            continue
          default:
            throw new Error(`Cannot format index of type ${expr.type}`)
        }
    }
    stmt.closeParenthesis()
    return stmt
  }

  formatCreateIndex(
    ctx: FormatContext,
    query: QueryData.CreateIndex
  ): Statement {
    const {stmt} = ctx
    stmt.add('CREATE')
    if (query.index.unique) stmt.add('UNIQUE')
    stmt.add('INDEX')
    if (query.ifNotExists) stmt.add('IF NOT EXISTS')
    stmt
      .addIdentifier(query.index.name)
      .add('ON')
      .addIdentifier(query.table.name)
    for (const expr of stmt.call(query.index.on)) {
      this.formatExprValue(
        {
          ...ctx,
          skipTableName: true,
          forceInline: true
        },
        expr
      )
    }
    this.formatWhere(ctx, query.where)
    return stmt
  }

  formatDropIndex(ctx: FormatContext, query: QueryData.DropIndex): Statement {
    const {stmt} = ctx
    stmt.add('DROP INDEX')
    if (query.ifExists) stmt.add('IF EXISTS')
    stmt.addIdentifier(query.name)
    return stmt
  }

  formatAlterTable(ctx: FormatContext, query: QueryData.AlterTable): Statement {
    const {stmt} = ctx
    stmt
      .add('ALTER TABLE')
      .addIdentifier(
        query.renameTable ? query.renameTable.from : query.table.name
      )
    if (query.addColumn) {
      stmt.add('ADD COLUMN').space()
      this.formatColumn(ctx, query.addColumn)
    } else if (query.dropColumn) {
      stmt.add('DROP COLUMN').addIdentifier(query.dropColumn)
    } else if (query.renameColumn) {
      stmt.add('RENAME COLUMN')
      stmt.addIdentifier(query.renameColumn.from).add('TO')
      stmt.addIdentifier(query.renameColumn.to)
    } else if (query.renameTable) {
      stmt.add('RENAME TO').addIdentifier(query.table.name)
    } else if (query.alterColumn) {
      throw new Error(`Not available in this formatter: alter column`)
    }
    return stmt
  }

  formatDropTable(ctx: FormatContext, query: QueryData.DropTable): Statement {
    const {stmt} = ctx
    stmt.add('DROP TABLE')
    if (query.ifExists) stmt.add('IF EXISTS')
    stmt.addIdentifier(query.table.name)
    return stmt
  }

  formatTransaction(
    ctx: FormatContext,
    {op, id}: QueryData.Transaction
  ): Statement {
    const {stmt} = ctx
    switch (op) {
      case QueryData.TransactionOperation.Begin:
        return stmt.raw('SAVEPOINT').addIdentifier(id)
      case QueryData.TransactionOperation.Commit:
        return stmt.raw('RELEASE').addIdentifier(id)
      case QueryData.TransactionOperation.Rollback:
        return stmt.raw('ROLLBACK TO').addIdentifier(id)
    }
  }

  formatBatch(ctx: FormatContext, {queries}: QueryData.Batch): Statement {
    const {stmt} = ctx
    for (const query of stmt.separate(queries, ';')) this.format(ctx, query)
    return stmt
  }

  formatRaw(ctx: FormatContext, {strings, params}: QueryData.Raw): Statement {
    const {stmt} = ctx
    for (let i = 0; i < strings.length; i++) {
      ctx.stmt.raw(strings[i])
      if (i < params.length) {
        const param = params[i]
        if (Expr.isExpr(param)) this.formatExpr(ctx, param[Expr.Data])
        else this.formatValue(ctx, param)
      }
    }
    return stmt
  }

  formatColumn(ctx: FormatContext, column: ColumnData): Statement {
    const {stmt} = ctx
    stmt.identifier(column.name).space()
    this.formatType(ctx, column.type)
    if (column.unique) stmt.add('UNIQUE')
    if (column.autoIncrement) stmt.add('AUTOINCREMENT')
    if (column.primaryKey) stmt.add('PRIMARY KEY')
    if (!column.nullable) stmt.add('NOT NULL')
    if (column.defaultValue !== undefined) {
      if (typeof column.defaultValue !== 'function') {
        stmt.add('DEFAULT').space()
        stmt.openParenthesis()
        this.formatExpr(
          {
            ...ctx,
            formatAsInsert: true,
            forceInline: true
          },
          column.defaultValue!
        )
        stmt.closeParenthesis()
      }
    }
    if (column.references) this.formatConstraintReference(ctx, column)
    return stmt
  }

  formatConstraintReference(
    ctx: FormatContext,
    {references, onDelete, onUpdate}: ColumnData
  ): Statement {
    const {stmt} = ctx
    if (!references) return stmt
    const reference = references()
    if (
      reference.type !== ExprType.Field ||
      reference.expr.type !== ExprType.Row
    )
      throw new Error('not supported')
    const from = reference.expr.target
    stmt
      .add('REFERENCES')
      .addIdentifier(Target.source(from)!.name)
      .openParenthesis()
      .identifier(reference.field)
      .closeParenthesis()
    if (onDelete && actions[onDelete])
      stmt.add('ON DELETE').add(actions[onDelete])
    if (onUpdate && actions[onUpdate])
      stmt.add('ON UPDATE').add(actions[onUpdate])
    return stmt
  }

  formatType(ctx: FormatContext, type: ColumnType): Statement {
    const {stmt} = ctx
    switch (type) {
      case ColumnType.String:
        return stmt.raw('TEXT')
      case ColumnType.Json:
        return stmt.raw('JSON')
      case ColumnType.Number:
        return stmt.raw('NUMERIC')
      case ColumnType.Boolean:
        return stmt.raw('BOOLEAN')
      case ColumnType.Integer:
        return stmt.raw('INTEGER')
    }
  }

  formatInsertRow(
    ctx: FormatContext,
    columns: Record<string, ColumnData>,
    row: Record<string, any>
  ): Statement {
    const {stmt} = ctx
    for (const [property, column] of stmt.call(Object.entries(columns))) {
      const columnValue = row[property]
      this.formatColumnValue(ctx, column, columnValue)
    }
    return stmt
  }

  formatColumnValue(
    ctx: FormatContext,
    column: ColumnData,
    columnValue: any
  ): Statement {
    const {stmt} = ctx
    if (Expr.isExpr(columnValue))
      return this.formatExprValue(ctx, columnValue[Expr.Data])
    const isNull = columnValue === undefined || columnValue === null
    const isOptional =
      column.nullable || column.autoIncrement || column.primaryKey
    if (isNull) {
      if (column.defaultValue !== undefined) {
        if (typeof column.defaultValue === 'function')
          return this.formatExprJson(
            {...ctx, formatAsInsert: true},
            column.defaultValue()
          )
        return this.formatExprJson(
          {...ctx, formatAsInsert: true},
          column.defaultValue
        )
      }
      if (!isOptional)
        throw new TypeError(`Expected value for column ${column.name}`)
      return stmt.raw('NULL')
    }
    switch (column.type) {
      case ColumnType.String:
        if (typeof columnValue !== 'string')
          throw new TypeError(`Expected string for column ${column.name}`)
        return stmt.value(columnValue)
      case ColumnType.Integer:
      case ColumnType.Number:
        if (typeof columnValue !== 'number')
          throw new TypeError(`Expected number for column ${column.name}`)
        return stmt.value(columnValue)
      case ColumnType.Boolean:
        if (typeof columnValue !== 'boolean')
          throw new TypeError(`Expected boolean for column ${column.name}`)
        return stmt.raw(this.escapeValue(columnValue))
      case ColumnType.Json:
        return stmt.value(JSON.stringify(columnValue))
    }
  }

  formatTarget(ctx: FormatContext, target: Target): Statement {
    const {stmt} = ctx
    switch (target.type) {
      case TargetType.Table:
        stmt.identifier(target.table.name)
        if (target.table.alias) stmt.add('AS').addIdentifier(target.table.alias)
        if (target.indexedBy) {
          stmt.add('INDEXED BY').addIdentifier(target.indexedBy.name)
        }
        return stmt
      case TargetType.Join:
        const {left, right, joinType} = target
        this.formatTarget(ctx, left)
        stmt.addLine(joins[joinType]).add('JOIN').space()
        this.formatTarget(ctx, right)
        stmt.add('ON').space()
        this.formatExprValue(ctx, target.on)
        return stmt
      case TargetType.Query:
        stmt.openParenthesis()
        this.format(ctx, target.query)
        stmt.closeParenthesis()
        if (target.alias) stmt.add('AS').addIdentifier(target.alias)
        return stmt
      case TargetType.CTE:
        return stmt.addIdentifier(target.name)
      case TargetType.Expr:
        throw new Error('Cannot format expression as target')
    }
  }

  formatWhere(
    {topLevel, ...ctx}: FormatContext,
    expr: ExprData | undefined
  ): Statement {
    const {stmt} = ctx
    if (!expr) return stmt
    stmt.addLine('WHERE').space()
    this.formatExprValue(ctx, expr)
    return stmt
  }

  formatHaving(
    {topLevel, ...ctx}: FormatContext,
    expr: ExprData | undefined
  ): Statement {
    const {stmt} = ctx
    if (!expr) return stmt
    stmt.addLine('HAVING')
    this.formatExprValue(ctx, expr)
    return stmt
  }

  formatGroupBy(
    ctx: FormatContext,
    groupBy: Array<ExprData> | undefined
  ): Statement {
    const {stmt} = ctx
    if (!groupBy || groupBy.length === 0) return stmt
    stmt.addLine('GROUP BY').space()
    for (const expr of stmt.separate(groupBy)) this.formatExprValue(ctx, expr)
    return stmt
  }

  formatOrderBy(
    ctx: FormatContext,
    orderBy: Array<OrderBy> | undefined
  ): Statement {
    const {stmt} = ctx
    if (!orderBy || orderBy.length === 0) return stmt
    stmt.addLine('ORDER BY').space()
    for (const {expr, order} of stmt.separate(orderBy)) {
      this.formatExprValue(ctx, expr)
      stmt.add(order === OrderDirection.Asc ? 'ASC' : 'DESC')
    }
    return stmt
  }

  formatLimit(
    ctx: FormatContext,
    {limit, offset, singleResult}: QueryData
  ): Statement {
    const {stmt} = ctx
    if (!limit && !offset && !singleResult) return stmt
    stmt.addLine('LIMIT').space()
    this.formatValue(ctx, (singleResult ? 1 : limit) || -1)
    if (offset && offset > 0) {
      stmt.add('OFFSET').space()
      this.formatValue(ctx, offset)
    }
    return stmt
  }

  formatSelection(
    ctx: FormatContext,
    selection: ExprData,
    formatSubject?: FormatSubject
  ): Statement {
    const {stmt} = ctx
    const mkSubject = () =>
      this.formatExpr(
        {
          ...ctx,
          formatAsJson: true
        },
        selection
      )
    if (formatSubject) formatSubject(stmt, mkSubject)
    else this.formatExpr(ctx, selection)
    if (!ctx.selectAsColumns) stmt.add('AS').addIdentifier('result')
    return stmt
  }

  formatString(ctx: FormatContext, input: string): Statement {
    const {stmt} = ctx
    return stmt.raw(this.escapeValue(String(input)))
  }

  formatInlineValue(ctx: FormatContext, rawValue: any): Statement {
    const {stmt} = ctx
    switch (true) {
      case rawValue === null || rawValue === undefined:
        return stmt.raw('NULL')
      case typeof rawValue === 'boolean':
        return rawValue ? stmt.raw('TRUE') : stmt.raw('FALSE')
      case typeof rawValue === 'string' || typeof rawValue === 'number':
        return this.formatString(ctx, rawValue)
      default:
        return this.formatString(ctx, JSON.stringify(rawValue))
    }
  }

  formatValue(ctx: FormatContext, rawValue: any, inline = false): Statement {
    const {stmt, formatAsJson, formatAsInsert, forceInline} = ctx
    const inlineValue = inline || forceInline
    const asJson = formatAsJson || formatAsInsert
    switch (true) {
      case rawValue === null || rawValue === undefined:
        return stmt.raw('NULL')
      case (formatAsInsert || !formatAsJson) && typeof rawValue === 'boolean':
        return rawValue ? stmt.raw('1') : stmt.raw('0')
      case !formatAsInsert && Array.isArray(rawValue):
        if (asJson) stmt.raw('json_array')
        stmt.openParenthesis()
        for (const v of stmt.separate(rawValue))
          this.formatValue({...ctx, formatAsJson: asJson}, v)
        stmt.closeParenthesis()
        return stmt
      case typeof rawValue === 'string' || typeof rawValue === 'number':
        if (inlineValue) return stmt.raw(this.escapeValue(rawValue))
        return stmt.value(rawValue)
      default:
        if (formatAsJson) {
          stmt.raw('json')
          stmt.openParenthesis()
        }
        if (inlineValue) this.formatString(ctx, JSON.stringify(rawValue))
        else stmt.value(JSON.stringify(rawValue))
        if (formatAsJson) stmt.closeParenthesis()
        return stmt
    }
  }

  formatExprJson(ctx: FormatContext, expr: ExprData): Statement {
    return this.formatExpr({...ctx, formatAsJson: true}, expr)
  }

  formatExprValue(ctx: FormatContext, expr: ExprData): Statement {
    return this.formatExpr({...ctx, formatAsJson: false}, expr)
  }

  formatExpr(ctx: FormatContext, expr: ExprData): Statement {
    switch (expr.type) {
      case ExprType.UnOp:
        return this.formatUnOp(ctx, expr)
      case ExprType.BinOp:
        return this.formatBinOp(ctx, expr)
      case ExprType.Param:
        return this.formatParam(ctx, expr)
      case ExprType.Field:
        return this.formatField(ctx, expr)
      case ExprType.Call:
        return this.formatCall(ctx, expr)
      case ExprType.Query:
        return this.formatQuery(ctx, expr)
      case ExprType.Row:
        return this.formatRow(ctx, expr)
      case ExprType.Merge:
        return this.formatMerge(ctx, expr)
      case ExprType.Record:
        return this.formatRecord(ctx, expr)
      case ExprType.Filter:
        return this.formatFilter(ctx, expr)
      case ExprType.Map:
        return this.formatMap(ctx, expr)
    }
  }

  formatUnOp(ctx: FormatContext, expr: ExprData.UnOp) {
    const {stmt} = ctx
    switch (expr.op) {
      case UnOpType.IsNull:
        return this.formatExprValue(ctx, expr.expr).add('IS NULL')
      case UnOpType.Not:
        stmt.raw('NOT').space().openParenthesis()
        this.formatExprValue(ctx, expr.expr)
        return stmt.closeParenthesis()
    }
  }

  formatBinOp(ctx: FormatContext, expr: ExprData.BinOp) {
    const {stmt} = ctx
    stmt.openParenthesis()
    this.formatExprValue(ctx, expr.a).add(binOps[expr.op]).space()
    switch (expr.op) {
      case BinOpType.Collate:
        const value =
          expr.b.type === ExprType.Param &&
          expr.b.param.type === ParamType.Value &&
          expr.b.param.value
        if (typeof value !== 'string') throw new Error('Expected string')
        stmt.add(this.escapeIdentifier(value))
        return stmt.closeParenthesis()
      case BinOpType.In:
      case BinOpType.NotIn:
        this.formatIn(ctx, expr.b)
        return stmt.closeParenthesis()
      default:
        this.formatExprValue(ctx, expr.b)
        return stmt.closeParenthesis()
    }
  }

  formatParam(ctx: FormatContext, expr: ExprData.Param): Statement {
    const {stmt} = ctx
    switch (expr.param.type) {
      case ParamType.Value:
        return this.formatValue(ctx, expr.param.value, expr.param.inline)
      case ParamType.Named:
        return stmt.param(expr.param)
    }
  }

  retrieveField(expr: ExprData, field: string): ExprData | undefined {
    switch (expr.type) {
      case ExprType.Record:
        return expr.fields[field]
      case ExprType.Merge:
        return (
          this.retrieveField(expr.a, field) || this.retrieveField(expr.b, field)
        )
      default:
        return undefined
    }
  }

  /**
   * Format a in "{a}->>{b}"
   */
  formatExprAccess(ctx: FormatContext, expr: ExprData) {
    const {stmt} = ctx
    if (expr.type === ExprType.Field && expr.expr.type === ExprType.Row) {
      const from = expr.expr
      switch (from.target.type) {
        case TargetType.Table:
          if (!ctx.skipTableName) {
            stmt
              .identifier(from.target.table.alias || from.target.table.name)
              .raw('.')
          }
          return stmt.identifier(expr.field)
      }
    }
    return this.formatExpr(ctx, expr)
  }

  /**
   * Format b in "{a} in {b}"
   */
  formatIn(ctx: FormatContext, expr: ExprData) {
    const {stmt} = ctx
    switch (expr.type) {
      case ExprType.Filter:
        return this.formatFilterIn(ctx, expr)
      case ExprType.Map:
        return this.formatMapIn(ctx, expr)
      case ExprType.Field:
        stmt.openParenthesis()
        stmt.raw('SELECT value FROM json_each')
        stmt.openParenthesis()
        this.formatExprValue(ctx, expr)
        stmt.closeParenthesis()
        return stmt.closeParenthesis()
      case ExprType.Param:
        if (
          expr.param.type === ParamType.Value &&
          Array.isArray(expr.param.value)
        ) {
          stmt.openParenthesis()
          for (const v of stmt.separate(expr.param.value))
            this.formatValue(ctx, v)
          return stmt.closeParenthesis()
        }
      default:
        return this.formatExpr(ctx, expr)
    }
  }

  formatFieldOf(ctx: FormatContext, from: ExprData, field: string) {
    const {stmt} = ctx
    const fieldExpr = this.retrieveField(from, field)
    if (fieldExpr) return this.formatExpr(ctx, fieldExpr)
    switch (from.type) {
      case ExprType.Row:
        switch (from.target.type) {
          case TargetType.CTE:
            return stmt.identifier(from.target.name).raw('.').identifier(field)
          case TargetType.Table:
            const column = from.target.table.columns[field]
            const asBoolean =
              column?.type === ColumnType.Boolean && ctx.formatAsJson
            const jsonColumn = column?.type === ColumnType.Json
            const asJson = jsonColumn && ctx.formatAsJson
            if (asJson) {
              stmt.raw('json')
              stmt.openParenthesis()
            }
            if (asBoolean) stmt.add(`json(iif(`)
            if (!ctx.skipTableName) {
              stmt
                .identifier(from.target.table.alias || from.target.table.name)
                .raw('.')
            }
            stmt.identifier(field)
            if (asBoolean) stmt.raw(`, 'true', 'false'))`)
            if (asJson) stmt.closeParenthesis()
            if (jsonColumn && !asJson) stmt.raw("->>'$'")
            return stmt
        }
      default:
        return this.formatAccess(
          ctx,
          () => this.formatExprAccess(ctx, from),
          field
        )
    }
  }

  formatField(ctx: FormatContext, expr: ExprData.Field): Statement {
    return this.formatFieldOf(ctx, expr.expr, expr.field)
  }

  formatCall(ctx: FormatContext, expr: ExprData.Call): Statement {
    const {stmt} = ctx
    if (expr.method === 'cast') {
      const [e, type] = expr.params
      const typeName =
        type.type === ExprType.Param &&
        type.param.type === ParamType.Value &&
        type.param.value
      stmt.raw('CAST').openParenthesis()
      this.formatExprValue(ctx, e).add('AS').space()
      this.formatString(ctx, typeName)
      return stmt.closeParenthesis()
    } else if (expr.method === 'exists') {
      stmt.raw('EXISTS').space()
      return this.formatExprValue(ctx, expr.params[0])
    } else {
      stmt.identifier(expr.method)
      for (const param of stmt.call(expr.params))
        this.formatExprValue(ctx, param)
      return stmt
    }
  }

  formatQuery(ctx: FormatContext, expr: ExprData.Query): Statement {
    const {stmt} = ctx
    if (!ctx.formatAsJson) {
      stmt.openParenthesis()
      this.format(ctx, expr.query)
      return stmt.closeParenthesis()
    }
    if (expr.query.singleResult) {
      stmt.openParenthesis()
      this.format({...ctx, topLevel: true}, expr.query)
      return stmt.closeParenthesis().raw(`->'$.result'`)
    }
    stmt
      .openParenthesis()
      .raw(`SELECT json_group_array(result->'$.result')`)
      .newline()
      .raw('FROM')
      .space()
      .openParenthesis()
    this.format({...ctx, topLevel: true}, expr.query)
    return stmt.closeParenthesis().closeParenthesis()
  }

  formatRow(ctx: FormatContext, expr: ExprData.Row): Statement {
    const {stmt} = ctx
    switch (expr.target.type) {
      case TargetType.Table:
        const table = Target.source(expr.target)
        if (!table) throw new Error(`Cannot select empty target`)
        if (ctx.tableAsExpr) return stmt.identifier(table.alias || table.name)
        if (ctx.selectAsColumns) {
          const inner = {...ctx, selectAsColumns: false}
          for (const [key, column] of stmt.separate(
            Object.entries(table.columns)
          )) {
            this.formatFieldOf(inner, expr, column.name!)
            stmt.add('AS').addIdentifier(key)
          }
          return stmt
        }
        stmt.identifier('json_object')
        for (const [key, column] of stmt.call(Object.entries(table.columns))) {
          this.formatString(ctx, key).raw(', ')
          this.formatFieldOf(ctx, expr, column.name!)
        }
        return stmt
      case TargetType.Query:
      case TargetType.Expr:
        return stmt.identifier(expr.target.alias!).raw('.value')
      default:
        throw new Error(`Cannot select from ${expr.target.type}`)
    }
  }

  formatMerge(ctx: FormatContext, expr: ExprData.Merge): Statement {
    const {stmt} = ctx
    stmt.identifier('json_patch').openParenthesis()
    this.formatExpr({...ctx, formatAsJson: true}, expr.a)
    stmt.raw(', ')
    this.formatExpr({...ctx, formatAsJson: true}, expr.b)
    return stmt.closeParenthesis()
  }

  formatRecord(ctx: FormatContext, expr: ExprData.Record): Statement {
    const {stmt} = ctx
    if (ctx.selectAsColumns) {
      const inner = {...ctx, selectAsColumns: false}
      for (const [key, value] of stmt.separate(Object.entries(expr.fields))) {
        this.formatExprJson(inner, value)
        stmt.add('AS').addIdentifier(key)
      }
      return stmt
    }
    stmt.identifier('json_object').openParenthesis()
    for (const [key, value] of stmt.separate(Object.entries(expr.fields))) {
      this.formatString(ctx, key).raw(', ')
      this.formatExprJson(ctx, value)
    }
    return stmt.closeParenthesis()
  }

  formatFilterIn(ctx: FormatContext, expr: ExprData.Filter): Statement {
    const {stmt} = ctx
    const {target, condition} = expr
    switch (target.type) {
      case TargetType.Expr:
        stmt.openParenthesis()
        stmt
          .raw('SELECT value AS result')
          .add('FROM json_each')
          .openParenthesis()
        this.formatExpr(ctx, target.expr)
        stmt.closeParenthesis()
        if (target.alias) stmt.add('AS').addIdentifier(target.alias)
        stmt.add('WHERE').space()
        this.formatExprValue(ctx, condition)
        return stmt.closeParenthesis()
      default:
        throw new Error('todo')
    }
  }

  formatFilter(ctx: FormatContext, expr: ExprData.Filter): Statement {
    const {stmt} = ctx
    switch (expr.target.type) {
      case TargetType.Expr:
        stmt
          .openParenthesis()
          .raw('SELECT json_group_array(json(result)) FROM ')
        this.formatFilterIn(ctx, expr)
        stmt.closeParenthesis()
        return stmt
      default:
        throw new Error('todo')
    }
  }

  formatMapIn(ctx: FormatContext, expr: ExprData.Map) {
    const {stmt} = ctx
    const {target, result} = expr
    switch (target.type) {
      case TargetType.Expr:
        stmt.openParenthesis()
        stmt.raw('SELECT').space()
        this.formatExpr(ctx, result)
          .add('AS result')
          .add('FROM json_each')
          .openParenthesis()
        this.formatExprJson(ctx, target.expr)
        stmt.closeParenthesis()
        if (target.alias) stmt.add('AS').addIdentifier(target.alias)
        return stmt.closeParenthesis()
      default:
        throw new Error('todo')
    }
  }

  formatMap(ctx: FormatContext, expr: ExprData.Map): Statement {
    const {stmt} = ctx
    switch (expr.target.type) {
      case TargetType.Expr:
        stmt
          .openParenthesis()
          .raw('SELECT json_group_array(json(result)) FROM ')
        this.formatMapIn(ctx, expr)
        stmt.closeParenthesis()
        return stmt
      default:
        throw new Error('todo')
    }
  }
}
