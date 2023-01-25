import {ColumnData, ColumnType} from './Column'
import {BinOp, Expr, ExprData, ExprType, UnOp} from './Expr'
import {OrderBy, OrderDirection} from './OrderBy'
import {ParamType} from './Param'
import {Query, QueryType} from './Query'
import {Sanitizer} from './Sanitizer'
import {Statement} from './Statement'
import {Target, TargetType} from './Target'

const binOps = {
  [BinOp.Add]: '+',
  [BinOp.Subt]: '-',
  [BinOp.Mult]: '*',
  [BinOp.Mod]: '%',
  [BinOp.Div]: '/',
  [BinOp.Greater]: '>',
  [BinOp.GreaterOrEqual]: '>=',
  [BinOp.Less]: '<',
  [BinOp.LessOrEqual]: '<=',
  [BinOp.Equals]: '=',
  [BinOp.NotEquals]: '!=',
  [BinOp.And]: 'and',
  [BinOp.Or]: 'or',
  [BinOp.Like]: 'like',
  [BinOp.Glob]: 'glob',
  [BinOp.Match]: 'match',
  [BinOp.In]: 'in',
  [BinOp.NotIn]: 'not in',
  [BinOp.Concat]: '||'
}

const joins = {
  left: 'left',
  inner: 'inner'
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
  formatSubject?: (mkSubject: () => void) => void
}

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

  compile<T>(query: Query<T>, formatInline = false) {
    const stmt = new Statement()
    const result = this.format(
      {
        stmt,
        formatSubject: mkSubject => {
          stmt.raw("json_object('result', ")
          mkSubject()
          stmt.raw(')')
        },
        nameResult: 'result'
      },
      query
    ).compile(this, formatInline)
    // console.log(result.sql)
    return result
  }

  format<T>(ctx: FormatContext, query: Query<T>): Statement {
    switch (query.type) {
      case QueryType.Select:
        return this.formatSelect(ctx, query)
      case QueryType.Insert:
        return this.formatInsert(ctx, query)
      case QueryType.Update:
        return this.formatUpdate(ctx, query)
      case QueryType.Delete:
        return this.formatDelete(ctx, query)
      case QueryType.CreateTable:
        return this.formatCreateTable(ctx, query)
      case QueryType.CreateIndex:
        return this.formatCreateIndex(ctx, query)
      case QueryType.DropIndex:
        return this.formatDropIndex(ctx, query)
      case QueryType.AlterTable:
        return this.formatAlterTable(ctx, query)
      case QueryType.Transaction:
        return this.formatTransaction(ctx, query)
      case QueryType.Batch:
        return this.formatBatch(ctx, query.queries)
      case QueryType.Raw:
        return this.formatRaw(ctx, query)
    }
  }

  formatSelect(ctx: FormatContext, query: Query.Select): Statement {
    const {stmt} = ctx
    stmt.add('SELECT').space()
    this.formatSelection(ctx, query.selection)
    stmt.addLine('FROM').space()
    this.formatTarget(ctx, query.from)
    this.formatWhere(ctx, query.where)
    this.formatGroupBy(ctx, query.groupBy)
    this.formatHaving(ctx, query.having)
    this.formatOrderBy(ctx, query.orderBy)
    this.formatLimit(ctx, query)
    return stmt
  }

  formatInsert(ctx: FormatContext, query: Query.Insert): Statement {
    const {stmt} = ctx
    const columns = Object.values(query.into.columns)
    stmt.add('INSERT INTO').addIdentifier(query.into.name)
    if (query.into.alias) stmt.raw('AS').addIdentifier(query.into.alias)
    for (const column of stmt.call(columns)) this.formatString(ctx, column.name)
    stmt.add('VALUES')
    for (const row of stmt.separate(query.data))
      this.formatInsertRow(ctx, query.into.columns, row)
    if (query.selection) {
      stmt.add('RETURNING').space()
      this.formatSelection(ctx, query.selection)
    }
    return stmt
  }

  formatUpdate(ctx: FormatContext, query: Query.Update): Statement {
    const {stmt} = ctx
    const data = query.set || {}
    stmt.add('UPDATE').addIdentifier(query.table.name).add('SET').space()
    for (const key of stmt.separate(Object.keys(data))) {
      stmt.identifier(key).add('=').space()
      this.formatExpr(
        {
          ...ctx,
          formatAsJson: true
        },
        ExprData.create(data[key])
      )
    }
    this.formatWhere(ctx, query.where)
    this.formatLimit(ctx, query)
    return stmt
  }

  formatDelete(ctx: FormatContext, query: Query.Delete): Statement {
    const {stmt} = ctx
    stmt.add('DELETE FROM').addIdentifier(query.table.name)
    stmt.space()
    this.formatWhere(ctx, query.where)
    stmt.space()
    this.formatLimit(ctx, query)
    return stmt
  }

  formatCreateTable(ctx: FormatContext, query: Query.CreateTable): Statement {
    const {stmt} = ctx
    stmt.add('CREATE TABLE')
    if (query.ifNotExists) stmt.add('IF NOT EXISTS')
    stmt.addIdentifier(query.table.name)
    for (const column of stmt.call(Object.values(query.table.columns))) {
      this.formatColumn(ctx, column)
    }
    return stmt
  }

  formatCreateIndex(ctx: FormatContext, query: Query.CreateIndex): Statement {
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

  formatDropIndex(ctx: FormatContext, query: Query.DropIndex): Statement {
    const {stmt} = ctx
    stmt.add('DROP INDEX')
    if (query.ifExists) stmt.add('IF EXISTS')
    stmt.addIdentifier(query.name)
    return stmt
  }

  formatAlterTable(ctx: FormatContext, query: Query.AlterTable): Statement {
    const {stmt} = ctx
    stmt.add('ALTER TABLE').addIdentifier(query.table.name)
    if (query.addColumn) {
      stmt.add('ADD COLUMN')
      this.formatColumn(ctx, query.addColumn)
    } else if (query.dropColumn) {
      stmt.add('DROP COLUMN').addIdentifier(query.dropColumn)
    } else if (query.alterColumn) {
      throw new Error(`Not available in this formatter: alter column`)
    }
    return stmt
  }

  formatTransaction(
    ctx: FormatContext,
    {op, id}: Query.Transaction
  ): Statement {
    const {stmt} = ctx
    switch (op) {
      case Query.TransactionOperation.Begin:
        return stmt.raw('SAVEPOINT').addIdentifier(id)
      case Query.TransactionOperation.Commit:
        return stmt.raw('RELEASE').addIdentifier(id)
      case Query.TransactionOperation.Rollback:
        return stmt.raw('ROLLBACK TO').addIdentifier(id)
    }
  }

  formatBatch(ctx: FormatContext, queries: Query[]): Statement {
    const {stmt} = ctx
    for (const query of stmt.separate(queries, ';')) this.format(ctx, query)
    return stmt
  }

  formatRaw(ctx: FormatContext, {strings, params}: Query.Raw): Statement {
    const {stmt} = ctx
    for (let i = 0; i < strings.length; i++) {
      ctx.stmt.raw(strings[i])
      if (i < params.length) {
        const param = params[i]
        if (param instanceof Expr) this.formatExpr(ctx, param.expr)
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
      stmt.add('DEFAULT').space()
      stmt.openParenthesis()
      this.formatExpr(
        {
          ...ctx,
          formatAsJson: true,
          forceInline: true
        },
        column.defaultValue!
      )
      stmt.closeParenthesis()
    }
    if (column.references) this.formatContraintReference(ctx, column.references)
    return stmt
  }

  formatContraintReference(ctx: FormatContext, reference: ExprData): Statement {
    const {stmt} = ctx
    if (
      reference.type !== ExprType.Field ||
      reference.expr.type !== ExprType.Row
    )
      throw new Error('not supported')
    const from = reference.expr.target
    return stmt
      .add('REFERENCES')
      .addIdentifier(Target.source(from)!.name)
      .openParenthesis()
      .identifier(reference.field)
      .closeParenthesis()
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
    if (columnValue instanceof Expr)
      return this.formatExprValue(ctx, columnValue.expr)
    const isNull = columnValue === undefined || columnValue === null
    const isOptional =
      column.nullable || column.autoIncrement || column.primaryKey
    if (isNull) {
      if (column.defaultValue !== undefined)
        return this.formatExprJson(ctx, column.defaultValue)
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
        if (typeof columnValue !== 'object')
          throw new TypeError(`Expected object for column ${column.name}`)
        return stmt.value(JSON.stringify(columnValue))
    }
  }

  formatTarget(ctx: FormatContext, target: Target): Statement {
    const {stmt} = ctx
    switch (target.type) {
      case TargetType.Table:
        stmt.identifier(target.table.name)
        if (target.table.alias) stmt.raw('AS').addIdentifier(target.table.alias)
        return stmt
      case TargetType.Join:
        const {left, right, joinType} = target
        this.formatTarget(ctx, left)
        stmt.addLine(joins[joinType]).add('JOIN')
        this.formatTarget(ctx, right)
        stmt.add('ON')
        this.formatExprValue(ctx, target.on)
        return stmt
      case TargetType.Query:
        stmt.openParenthesis()
        this.format(ctx, target.query)
        stmt.closeParenthesis()
        if (target.alias) stmt.raw('AS').addIdentifier(target.alias)
        return stmt
      case TargetType.Expr:
        throw new Error('Cannot format expression as target')
    }
  }

  formatWhere(ctx: FormatContext, expr: ExprData | undefined): Statement {
    const {stmt} = ctx
    if (!expr) return stmt
    stmt.newline().raw('WHERE')
    this.formatExprValue(ctx, expr)
    return stmt
  }

  formatHaving(ctx: FormatContext, expr: ExprData | undefined): Statement {
    const {stmt} = ctx
    if (!expr) return stmt
    stmt.newline().raw('HAVING')
    this.formatExprValue(ctx, expr)
    return stmt
  }

  formatGroupBy(
    ctx: FormatContext,
    groupBy: Array<ExprData> | undefined
  ): Statement {
    const {stmt} = ctx
    if (!groupBy) return stmt
    stmt.newline().raw('GROUP BY')
    for (const expr of stmt.separate(groupBy)) this.formatExprValue(ctx, expr)
    return stmt
  }

  formatOrderBy(
    ctx: FormatContext,
    orderBy: Array<OrderBy> | undefined
  ): Statement {
    const {stmt} = ctx
    if (!orderBy) return stmt
    stmt.newline().raw('ORDER BY')
    for (const {expr, order} of stmt.separate(orderBy)) {
      this.formatExprValue(ctx, expr)
      stmt.add(order === OrderDirection.Asc ? 'ASC' : 'DESC')
    }
    return stmt
  }

  formatLimit(
    ctx: FormatContext,
    {limit, offset, singleResult}: Query.QueryBase
  ): Statement {
    const {stmt} = ctx
    if (!limit && !offset && !singleResult) return stmt
    stmt
      .newline()
      .raw('LIMIT')
      .addValue(singleResult ? 1 : limit)
    if (offset && offset > 0) stmt.raw('OFFSET').addValue(offset)
    return stmt
  }

  formatSelection(ctx: FormatContext, selection: ExprData): Statement {
    const {stmt, formatSubject} = ctx
    const mkSubject = () =>
      this.formatExpr(
        {
          ...ctx,
          formatSubject: undefined,
          formatAsJson: true
        },
        selection
      )
    if (formatSubject) formatSubject(mkSubject)
    else mkSubject()
    if (ctx.nameResult) stmt.add('AS').addIdentifier(ctx.nameResult)
    return stmt
  }

  formatExprJson(ctx: FormatContext, expr: ExprData): Statement {
    return this.formatExpr({...ctx, formatAsJson: true}, expr)
  }

  formatExprValue(ctx: FormatContext, expr: ExprData): Statement {
    return this.formatExpr({...ctx, formatAsJson: false}, expr)
  }

  formatIn(ctx: FormatContext, expr: ExprData): Statement {
    const {stmt} = ctx
    switch (expr.type) {
      case ExprType.Field:
        stmt.openParenthesis()
        stmt.raw('SELECT value FROM json_each')
        stmt.openParenthesis()
        this.formatExprJson(ctx, expr)
        stmt.closeParenthesis()
        stmt.closeParenthesis()
        return stmt
      default:
        return this.formatExprValue(ctx, expr)
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

  formatField(ctx: FormatContext, expr: ExprData, field: string): Statement {
    const {stmt} = ctx
    const fieldExpr = this.retrieveField(expr, field)
    if (fieldExpr) return this.formatExpr(ctx, fieldExpr)
    switch (expr.type) {
      case ExprType.Row:
        switch (expr.target.type) {
          case TargetType.Table:
            const column = expr.target.table.columns[field]
            const asJson = column?.type === ColumnType.Json && ctx.formatAsJson
            if (asJson) {
              stmt.add('json')
              stmt.openParenthesis()
            }
            if (!ctx.skipTableName) {
              stmt
                .identifier(expr.target.table.alias || expr.target.table.name)
                .raw('.')
            }
            stmt.identifier(field)
            if (asJson) stmt.closeParenthesis()
            return stmt
        }
      default:
        return this.formatAccess(ctx, () => this.formatExpr(ctx, expr), field)
    }
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

  formatValue(ctx: FormatContext, rawValue: any): Statement {
    const {stmt, formatAsJson, forceInline} = ctx
    switch (true) {
      case rawValue === null || rawValue === undefined:
        return stmt.raw('NULL')
      case !formatAsJson && typeof rawValue === 'boolean':
        return rawValue ? stmt.raw('1') : stmt.raw('0')
      case Array.isArray(rawValue):
        if (formatAsJson) {
          stmt.raw('json_array')
          stmt.openParenthesis()
        }
        for (const v of stmt.separate(rawValue))
          this.formatValue({...ctx, formatAsJson: false}, v)
        if (formatAsJson) stmt.closeParenthesis()
        return stmt
      case typeof rawValue === 'string' || typeof rawValue === 'number':
        if (forceInline) return stmt.raw(this.escapeValue(rawValue))
        return stmt.value(rawValue)
      default:
        if (formatAsJson) {
          stmt.raw('json')
          stmt.openParenthesis()
        }
        this.formatString(ctx, JSON.stringify(rawValue))
        if (formatAsJson) stmt.closeParenthesis()
        return stmt
    }
  }

  formatExpr(ctx: FormatContext, expr: ExprData): Statement {
    const {stmt} = ctx
    switch (expr.type) {
      case ExprType.UnOp:
        switch (expr.op) {
          case UnOp.IsNull:
            return this.formatExprValue(ctx, expr.expr).add('IS NULL')
          case UnOp.Not:
            stmt.raw('NOT').openParenthesis()
            this.formatExprValue(ctx, expr.expr)
            return stmt.closeParenthesis()
        }
      case ExprType.BinOp:
        stmt.openParenthesis()
        this.formatExprValue(ctx, expr.a).add(binOps[expr.op]).space()
        if (expr.op === BinOp.In || expr.op === BinOp.NotIn)
          this.formatIn(ctx, expr.b)
        else this.formatExprValue(ctx, expr.b)
        return stmt.closeParenthesis()
      case ExprType.Param:
        switch (expr.param.type) {
          case ParamType.Value:
            return this.formatValue(ctx, expr.param.value)
          case ParamType.Named:
            return stmt.param(expr.param.name)
        }
      case ExprType.Field:
        return this.formatField(ctx, expr.expr, expr.field)
      case ExprType.Call: {
        if (expr.method === 'cast') {
          const [e, type] = expr.params
          const typeName =
            type.type === ExprType.Param &&
            type.param.type === ParamType.Value &&
            type.param.value
          stmt.raw('cast').openParenthesis()
          this.formatExprValue(ctx, e).add('as').space()
          this.formatString(ctx, typeName)
          return stmt.closeParenthesis()
        } else if (expr.method === 'exists') {
          stmt.raw('exists').space()
          return this.formatExprValue(ctx, expr.params[0])
        } else {
          stmt.identifier(expr.method)
          for (const param of stmt.call(expr.params))
            this.formatExprValue(ctx, param)
          return stmt
        }
      }
      case ExprType.Query:
        if (!ctx.formatAsJson) {
          stmt.openParenthesis()
          this.format(ctx, expr.query)
          return stmt.closeParenthesis()
        }
        if (expr.query.singleResult) {
          stmt.raw('json').openParenthesis().openParenthesis()
          this.format({...ctx, nameResult: 'result'}, expr.query)
          return stmt.closeParenthesis().closeParenthesis()
        }
        stmt
          .openParenthesis()
          .raw('SELECT json_group_array(json(result))')
          .newline()
          .raw('FROM')
          .openParenthesis()
        this.format({...ctx, nameResult: 'result'}, expr.query)
        return stmt.closeParenthesis().closeParenthesis()
      case ExprType.Row:
        switch (expr.target.type) {
          case TargetType.Table:
            const table = Target.source(expr.target)
            if (!table) throw new Error(`Cannot select empty target`)
            if (ctx.tableAsExpr)
              return stmt.identifier(table.alias || table.name)
            return this.formatExpr(
              ctx,
              ExprData.Record(
                Object.fromEntries(
                  Object.entries(table.columns).map(([key, column]) => [
                    key,
                    ExprData.Field(ExprData.Row(expr.target), column.name!)
                  ])
                )
              )
            )
          case TargetType.Query:
          case TargetType.Expr:
            return stmt.identifier(expr.target.alias!).raw('.value')
          default:
            throw new Error(`Cannot select from ${expr.target.type}`)
        }
      case ExprType.Merge:
        stmt.identifier('json_patch').openParenthesis()
        this.formatExpr({...ctx, formatAsJson: true}, expr.a)
        stmt.raw(', ')
        this.formatExpr({...ctx, formatAsJson: true}, expr.b)
        return stmt.closeParenthesis()
      case ExprType.Record:
        stmt.identifier('json_object')
        for (const [key, value] of stmt.call(Object.entries(expr.fields))) {
          this.formatString(ctx, key).raw(', ')
          this.formatExprJson(ctx, value)
        }
        return stmt
      case ExprType.Filter: {
        const {target, condition} = expr
        switch (target.type) {
          case TargetType.Expr:
            stmt
              .openParenthesis()
              .raw('SELECT json_group_array(json(result)) FROM ')
              .openParenthesis()
              .raw('SELECT value AS result')
              .add('FROM json_each')
              .openParenthesis()
            this.formatExprJson(ctx, target.expr)
            stmt.closeParenthesis()
            if (target.alias) stmt.add('AS').addIdentifier(target.alias)
            stmt.add('WHERE').space()
            this.formatExprValue(ctx, condition)
            return stmt.closeParenthesis().closeParenthesis()
          default:
            throw new Error('todo')
        }
      }
      case ExprType.Map: {
        const {target, result} = expr
        switch (target.type) {
          case TargetType.Expr:
            stmt
              .openParenthesis()
              .raw('SELECT json_group_array(json(result)) FROM ')
              .openParenthesis()
              .raw('SELECT')
              .space()
            this.formatExprJson(ctx, result)
              .add('AS result')
              .add('FROM json_each')
              .openParenthesis()
            this.formatExprJson(ctx, target.expr)
            stmt.closeParenthesis()
            if (target.alias) stmt.add('AS').addIdentifier(target.alias)
            return stmt.closeParenthesis().closeParenthesis()
          default:
            throw new Error('todo')
        }
      }
      default:
        console.log(expr)
        throw new Error('todo')
    }
  }
}
