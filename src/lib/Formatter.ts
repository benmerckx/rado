import {ColumnData, ColumnType} from './Column'
import {BinOp, Expr, ExprData, ExprType, UnOp} from './Expr'
import {OrderBy, OrderDirection} from './OrderBy'
import {ParamType} from './Param'
import {Query, QueryType} from './Query'
import {Sanitizer} from './Sanitizer'
import {
  Statement,
  call,
  identifier,
  newline,
  param,
  parenthesis,
  raw,
  separated,
  value
} from './Statement'
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
  nameResult?: string
  skipTableName?: boolean
  forceInline?: boolean
  formatAsJson?: boolean
  formatSubject?: (subject: Statement) => Statement
}

export abstract class Formatter implements Sanitizer {
  constructor() {}

  abstract escapeValue(value: any): string
  abstract escapeIdentifier(ident: string): string
  abstract formatSqlAccess(on: Statement, field: string): Statement
  abstract formatJsonAccess(on: Statement, field: string): Statement

  formatAccess(
    on: Statement,
    field: string,
    formatAsJson?: boolean
  ): Statement {
    return formatAsJson
      ? this.formatJsonAccess(on, field)
      : this.formatSqlAccess(on, field)
  }

  compile<T>(query: Query<T>, formatInline = false) {
    const result = this.format(query, {
      formatSubject: select => call('json_object', raw("'result'"), select),
      nameResult: 'result'
    }).compile(this, formatInline)
    return result
  }

  format<T>(query: Query<T>, ctx: FormatContext = {}): Statement {
    switch (query.type) {
      case QueryType.Select:
        return this.formatSelect(query, ctx)
      case QueryType.Insert:
        return this.formatInsert(query, ctx)
      case QueryType.Update:
        return this.formatUpdate(query, ctx)
      case QueryType.Delete:
        return this.formatDelete(query, ctx)
      case QueryType.CreateTable:
        return this.formatCreateTable(query, ctx)
      case QueryType.CreateIndex:
        return this.formatCreateIndex(query, ctx)
      case QueryType.DropIndex:
        return this.formatDropIndex(query, ctx)
      case QueryType.AlterTable:
        return this.formatAlterTable(query, ctx)
      case QueryType.Transaction:
        return this.formatTransaction(query, ctx)
      case QueryType.Batch:
        return this.formatBatch(query.queries, ctx)
      case QueryType.Raw:
        return this.formatRaw(query, ctx)
    }
  }

  formatSelect(query: Query.Select, ctx: FormatContext) {
    return raw('select')
      .add(this.formatSelection(query.selection, ctx))
      .addLine('from')
      .add(this.formatTarget(query.from, ctx))
      .add(this.formatWhere(query.where, ctx))
      .add(this.formatGroupBy(query.groupBy, ctx))
      .add(this.formatHaving(query.having, ctx))
      .add(this.formatOrderBy(query.orderBy, ctx))
      .add(this.formatLimit(query, ctx))
  }

  formatInsert(query: Query.Insert, ctx: FormatContext) {
    const columns = Object.values(query.into.columns)
    return raw('insert into')
      .addCall(
        query.into.name,
        ...columns.map(column => this.formatString(column.name!))
      )
      .add('values')
      .addSeparated(
        query.data.map(row => this.formatInsertRow(query.into.columns, row))
      )
      .addIf(query.selection, () =>
        raw('returning').add(this.formatSelection(query.selection!, ctx))
      )
  }

  formatUpdate(query: Query.Update, ctx: FormatContext) {
    const data = query.set || {}
    return raw('update')
      .addIdentifier(query.table.name)
      .add('set')
      .addSeparated(
        Object.keys(data).map(key => {
          const column = query.table.columns[key]
          const exprData = data[key]
          return identifier(key)
            .add('=')
            .add(
              this.formatExpr(ExprData.create(data[key]), {
                ...ctx,
                formatAsJson: true
              })
            )
        })
      )
      .add(this.formatWhere(query.where, ctx))
      .add(this.formatLimit(query, ctx))
  }

  formatDelete(query: Query.Delete, ctx: FormatContext) {
    return raw('delete from')
      .addIdentifier(query.table.name)
      .add(this.formatWhere(query.where, ctx))
      .add(this.formatLimit(query, ctx))
  }

  formatCreateTable(query: Query.CreateTable, ctx: FormatContext) {
    return raw('create table')
      .addIf(query.ifNotExists, 'if not exists')
      .addCall(
        query.table.name,
        ...Object.values(query.table.columns).map(column => {
          return this.formatColumn(column)
        })
      )
  }

  formatCreateIndex(query: Query.CreateIndex, ctx: FormatContext = {}) {
    return raw('create')
      .addIf(query.index.unique, 'unique')
      .add('index')
      .addIf(query.ifNotExists, 'if not exists')
      .addIdentifier(query.index.name)
      .add('on')
      .addIdentifier(query.table.name)
      .parenthesis(
        separated(
          query.index.on.map(expr =>
            this.formatExprValue(expr, {
              ...ctx,
              skipTableName: true,
              forceInline: true
            })
          )
        )
      )
      .add(this.formatWhere(query.where, ctx))
  }

  formatDropIndex(query: Query.DropIndex, ctx: FormatContext) {
    return raw('drop index')
      .addIf(query.ifExists, 'if exists')
      .addIdentifier(query.name)
  }

  formatAlterTable(query: Query.AlterTable, ctx: FormatContext) {
    let stmt = raw('alter table').addIdentifier(query.table.name)
    if (query.addColumn) {
      stmt = stmt.add('add column').add(this.formatColumn(query.addColumn))
    } else if (query.dropColumn) {
      stmt = stmt.add('drop column').addIdentifier(query.dropColumn)
    } else if (query.alterColumn) {
      throw new Error(`Not available in this formatter: alter column`)
    }
    return stmt
  }

  formatTransaction({op, id}: Query.Transaction, ctx: FormatContext) {
    switch (op) {
      case Query.TransactionOperation.Begin:
        return raw('savepoint').addIdentifier(id)
      case Query.TransactionOperation.Commit:
        return raw('release').addIdentifier(id)
      case Query.TransactionOperation.Rollback:
        return raw('rollback to').addIdentifier(id)
    }
  }

  formatBatch(queries: Query[], ctx: FormatContext) {
    return separated(
      queries.map(query => this.format(query, ctx)),
      '; '
    )
  }

  formatRaw({strings, params}: Query.Raw, ctx: FormatContext) {
    return Statement.tag(
      strings,
      params.map(param => {
        if (param instanceof Expr) return this.formatExpr(param.expr, ctx)
        return this.formatValue(param, ctx)
      })
    )
  }

  formatColumn(column: ColumnData) {
    return identifier(column.name!)
      .add(this.formatType(column.type))
      .addIf(column.unique, 'unique')
      .addIf(column.autoIncrement, 'autoincrement')
      .addIf(column.primaryKey, 'primary key')
      .addIf(!column.nullable, 'not null')
      .addIf(
        column.defaultValue !== undefined,
        raw('default').add(this.formatInlineValue(column.defaultValue))
      )
      .addIf(column.references, () => {
        return this.formatContraintReference(column.references!)
      })
  }

  formatContraintReference(reference: ExprData) {
    if (
      reference.type !== ExprType.Field ||
      reference.expr.type !== ExprType.Row
    )
      throw new Error('not supported')
    const from = reference.expr.target
    return raw('references')
      .addIdentifier(Target.source(from)!.name)
      .parenthesis(identifier(reference.field))
  }

  formatType(type: ColumnType): Statement {
    switch (type) {
      case ColumnType.String:
        return raw('text')
      case ColumnType.Json:
        return raw('json')
      case ColumnType.Number:
        return raw('numeric')
      case ColumnType.Boolean:
        return raw('boolean')
      case ColumnType.Integer:
        return raw('integer')
    }
  }

  formatInsertRow(
    columns: Record<string, ColumnData>,
    row: Record<string, any>
  ) {
    return parenthesis(
      separated(
        Object.entries(columns).map(([property, column]) => {
          const columnValue = row[property]
          return this.formatColumnValue(column, columnValue)
        })
      )
    )
  }

  formatColumnValue(column: ColumnData, columnValue: any) {
    if (columnValue instanceof Expr)
      return this.formatExprValue(columnValue.expr, {})
    const isNull = columnValue === undefined || columnValue === null
    const isOptional =
      column.nullable ||
      column.autoIncrement ||
      column.primaryKey ||
      column.defaultValue
    if (isNull) {
      if (!isOptional)
        throw new TypeError(`Expected value for column ${column.name}`)
      return raw('null')
    }
    switch (column.type) {
      case ColumnType.String:
        if (typeof columnValue !== 'string')
          throw new TypeError(`Expected string for column ${column.name}`)
        return value(columnValue)
      case ColumnType.Integer:
      case ColumnType.Number:
        if (typeof columnValue !== 'number')
          throw new TypeError(`Expected number for column ${column.name}`)
        return value(columnValue)
      case ColumnType.Boolean:
        if (typeof columnValue !== 'boolean')
          throw new TypeError(`Expected boolean for column ${column.name}`)
        return raw(this.escapeValue(columnValue))
      case ColumnType.Json:
        if (typeof columnValue !== 'object')
          throw new TypeError(`Expected object for column ${column.name}`)
        return value(JSON.stringify(columnValue))
    }
  }

  formatTarget(target: Target, ctx: FormatContext): Statement {
    switch (target.type) {
      case TargetType.Table:
        return identifier(target.table.name).addIf(target.table.alias, () =>
          raw('as').addIdentifier(target.table.alias!)
        )
      case TargetType.Join:
        const {left, right, joinType} = target
        return this.formatTarget(left, ctx)
          .addLine(joins[joinType])
          .add('join')
          .add(this.formatTarget(right, ctx))
          .add('on')
          .add(this.formatExprValue(target.on, ctx))
      default:
        throw new Error(`Cannot format target of type ${target.type}`)
    }
  }

  formatWhere(expr: ExprData | undefined, ctx: FormatContext) {
    if (!expr) return
    return newline().raw('where').add(this.formatExprValue(expr, ctx))
  }

  formatHaving(expr: ExprData | undefined, ctx: FormatContext) {
    if (!expr) return
    return newline().raw('having').add(this.formatExprValue(expr, ctx))
  }

  formatGroupBy(groupBy: Array<ExprData> | undefined, ctx: FormatContext) {
    if (!groupBy) return
    return newline()
      .raw('group by')
      .addSeparated(groupBy.map(expr => this.formatExprValue(expr, ctx)))
  }

  formatOrderBy(orderBy: Array<OrderBy> | undefined, ctx: FormatContext) {
    if (!orderBy) return
    return newline()
      .raw('order by')
      .addSeparated(
        orderBy.map(({expr, order}) =>
          this.formatExprValue(expr, ctx).add(
            order === OrderDirection.Asc ? 'asc' : 'desc'
          )
        )
      )
  }

  formatLimit(
    {limit, offset, singleResult}: Query.QueryBase,
    ctx: FormatContext
  ) {
    if (!limit && !offset && !singleResult) return
    return newline()
      .raw('limit')
      .addValue(singleResult ? 1 : limit)
      .addIf(offset && offset > 0, raw('offset').addValue(offset))
  }

  formatSelection(selection: ExprData, ctx: FormatContext): Statement {
    const {formatSubject} = ctx
    const subject = this.formatExpr(selection, {
      ...ctx,
      formatSubject: undefined,
      formatAsJson: true
    })
    return (formatSubject ? formatSubject(subject) : subject).addIf(
      ctx.nameResult,
      raw('as').addIdentifier(ctx.nameResult!)
    )
  }

  formatExprValue(expr: ExprData, ctx: FormatContext): Statement {
    return this.formatExpr(expr, {...ctx, formatAsJson: false})
  }

  formatIn(expr: ExprData, ctx: FormatContext): Statement {
    switch (expr.type) {
      case ExprType.Field:
        return this.formatUnwrapArray(this.formatExprValue(expr, ctx))
      default:
        return this.formatExprValue(expr, ctx)
    }
  }

  formatUnwrapArray(stmt: Statement): Statement {
    return parenthesis(raw('select value from').addCall('json_each', stmt))
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

  formatField(expr: ExprData, field: string, ctx: FormatContext): Statement {
    const fieldExpr = this.retrieveField(expr, field)
    if (fieldExpr) return this.formatExpr(fieldExpr, ctx)
    switch (expr.type) {
      case ExprType.Row:
        switch (expr.target.type) {
          case TargetType.Table:
            const selection = ctx.skipTableName
              ? identifier(field)
              : identifier(expr.target.table.alias || expr.target.table.name)
                  .raw('.')
                  .identifier(field)
            const column = expr.target.table.columns[field]
            switch (column?.type) {
              case ColumnType.Json:
                return call('json', selection)
              default:
                return selection
            }
        }
      default:
        return this.formatAccess(
          this.formatExpr(expr, {...ctx, formatAsJson: true}),
          field,
          ctx.formatAsJson
        )
    }
  }

  formatString(input: string): Statement {
    return raw(this.escapeValue(String(input)))
  }

  formatInlineValue(rawValue: any): Statement {
    switch (true) {
      case rawValue === null || rawValue === undefined:
        return raw('null')
      case typeof rawValue === 'boolean':
        return rawValue ? raw('true') : raw('false')
      case typeof rawValue === 'string' || typeof rawValue === 'number':
        return this.formatString(rawValue)
      default:
        return this.formatString(JSON.stringify(rawValue))
    }
  }

  formatValue(rawValue: any, ctx: FormatContext): Statement {
    const {formatAsJson, forceInline} = ctx
    switch (true) {
      case rawValue === null || rawValue === undefined:
        return raw('null')
      case !formatAsJson && typeof rawValue === 'boolean':
        return rawValue ? raw('1') : raw('0')
      case Array.isArray(rawValue):
        const res = parenthesis(
          separated(
            rawValue.map((v: any) =>
              this.formatValue(v, {...ctx, formatAsJson: false})
            )
          )
        )
        return formatAsJson ? raw('json_array').concat(res) : res
      case typeof rawValue === 'string' || typeof rawValue === 'number':
        if (forceInline) return raw(this.escapeValue(rawValue))
        return value(rawValue)
      default:
        const expr = this.formatString(JSON.stringify(rawValue))
        if (formatAsJson) return call('json', expr)
        return expr
    }
  }

  formatExpr(expr: ExprData, ctx: FormatContext): Statement {
    switch (expr.type) {
      case ExprType.UnOp:
        switch (expr.op) {
          case UnOp.IsNull:
            return this.formatExprValue(expr.expr, ctx).add('is null')
          case UnOp.Not:
            return raw('not').addParenthesis(
              this.formatExprValue(expr.expr, ctx)
            )
        }
      case ExprType.BinOp:
        return parenthesis(
          this.formatExprValue(expr.a, ctx)
            .add(binOps[expr.op])
            .add(
              expr.op === BinOp.In || expr.op === BinOp.NotIn
                ? this.formatIn(expr.b, ctx)
                : this.formatExprValue(expr.b, ctx)
            )
        )
      case ExprType.Param:
        switch (expr.param.type) {
          case ParamType.Value:
            return this.formatValue(expr.param.value, ctx)
          case ParamType.Named:
            return param(expr.param.name)
        }
      case ExprType.Field:
        return this.formatField(expr.expr, expr.field, ctx)
      case ExprType.Call: {
        if (expr.method === 'cast') {
          const [e, type] = expr.params
          const typeName =
            type.type === ExprType.Param &&
            type.param.type === ParamType.Value &&
            type.param.value
          return raw('cast').parenthesis(
            this.formatExprValue(e, ctx)
              .add('as')
              .add(this.formatString(typeName))
          )
        } else {
          const params = expr.params.map(expr =>
            this.formatExprValue(expr, ctx)
          )
          return call(expr.method, ...params)
        }
      }
      case ExprType.Query:
        if (!ctx.formatAsJson) return parenthesis(this.format(expr.query, ctx))
        const subQuery = this.format(expr.query, {...ctx, nameResult: 'result'})
        if (expr.query.singleResult) return call('json', parenthesis(subQuery))
        return parenthesis(
          raw('select json_group_array(json(result))')
            .newline()
            .raw('from ')
            .parenthesis(subQuery)
        )
      case ExprType.Row:
        switch (expr.target.type) {
          case TargetType.Table:
            const table = Target.source(expr.target)
            if (!table) throw new Error(`Cannot select empty target`)
            return this.formatExpr(
              ExprData.Record(
                Object.fromEntries(
                  Object.entries(table.columns).map(([key, column]) => [
                    key,
                    ExprData.Field(ExprData.Row(expr.target), column.name!)
                  ])
                )
              ),
              ctx
            )
          case TargetType.Each:
            return identifier(expr.target.alias).raw('.value')
          default:
            throw new Error(`Cannot select from ${expr.target.type}`)
        }
      case ExprType.Merge:
        return call(
          'json_patch',
          this.formatExpr(expr.a, {...ctx, formatAsJson: true}),
          this.formatExpr(expr.b, {...ctx, formatAsJson: true})
        )
      case ExprType.Record:
        return call(
          'json_object',
          ...Object.entries(expr.fields).map(([key, value]) => {
            return this.formatString(key)
              .raw(', ')
              .concat(this.formatExpr(value, {...ctx, formatAsJson: true}))
          })
        )
      case ExprType.Filter: {
        const {target, condition} = expr
        switch (target.type) {
          case TargetType.Each:
            return parenthesis(
              raw('select json_group_array(json(result)) from').addParenthesis(
                raw('select value as result')
                  .add('from')
                  .addCall(
                    'json_each',
                    this.formatExpr(target.expr, {...ctx, formatAsJson: true})
                  )
                  .add('as')
                  .addIdentifier(target.alias)
                  .add('where')
                  .add(this.formatExprValue(condition, ctx))
              )
            )
          default:
            throw new Error('todo')
        }
      }
      case ExprType.Map: {
        const {target, result} = expr
        switch (target.type) {
          case TargetType.Each:
            return parenthesis(
              raw('select json_group_array(json(result)) from').addParenthesis(
                raw('select')
                  .add(this.formatExpr(result, {...ctx, formatAsJson: true}))
                  .add('as')
                  .addIdentifier('result')
                  .add('from')
                  .addCall(
                    'json_each',
                    this.formatExpr(target.expr, {...ctx, formatAsJson: true})
                  )
                  .add('as')
                  .addIdentifier(target.alias)
              )
            )
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
