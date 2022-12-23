import {Column, ColumnType} from './Column'
import {BinOp, ExprData, ExprType, UnOp} from './Expr'
import {OrderBy, OrderDirection} from './OrderBy'
import {ParamType} from './Param'
import {Query, QueryType} from './Query'
import {Sanitizer} from './Sanitizer'
import {
  Statement,
  call,
  ident,
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
  formatAsJson?: boolean
  formatSubject?: (subject: Statement) => Statement
}

export abstract class Formatter implements Sanitizer {
  constructor() {}

  abstract escapeValue(value: any): string
  abstract escapeIdent(ident: string): string
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
    return this.format(query, {
      formatSubject: select => call('json_object', raw("'result'"), select)
    }).compile(this, formatInline)
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
      case QueryType.Batch:
        return this.formatBatch(query.queries, ctx)
    }
  }

  formatSelect(query: Query.Select, ctx: FormatContext) {
    return raw('select')
      .add(this.formatSelection(query, ctx))
      .addIf(ctx.nameResult, raw('as').addIdent(ctx.nameResult!))
      .add('from')
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
        ...columns.map(column => this.formatString(column.name))
      )
      .add('values')
      .addSeparated(
        query.data.map(row =>
          this.formatInsertRow(Object.keys(query.into.columns), row)
        )
      )
  }

  formatUpdate(query: Query.Update, ctx: FormatContext) {
    const data = query.set || {}
    return raw('update')
      .addIdent(query.collection.name)
      .add('set')
      .addSeparated(
        Object.keys(data).map(column => {
          return ident(column)
            .add('=')
            .add(this.formatExprValue(ExprData.create(data[column]), ctx))
        })
      )
      .add(this.formatWhere(query.where, ctx))
      .add(this.formatLimit(query, ctx))
  }

  formatDelete(query: Query.Delete, ctx: FormatContext) {
    return raw('delete from')
      .addIdent(query.collection.name)
      .add(this.formatWhere(query.where, ctx))
      .add(this.formatLimit(query, ctx))
  }

  formatCreateTable(query: Query.CreateTable, ctx: FormatContext) {
    return raw('create table')
      .addIf(query.ifNotExists, 'if not exists')
      .addCall(
        query.collection.name,
        ...Object.values(query.collection.columns).map(column => {
          return this.formatColumn(column)
        })
      )
  }

  formatBatch(queries: Query[], ctx: FormatContext) {
    return separated(
      queries.map(query => this.format(query, ctx)),
      ';'
    )
  }

  formatColumn(column: Column) {
    return ident(column.name)
      .add(this.formatType(column.data.type))
      .addIf(column.data.notNull, 'not null')
      .addIf(column.data.unique, 'unique')
      .addIf(column.data.autoIncrement, 'autoincrement')
      .addIf(column.data.primaryKey, 'primary key')
      .addIf(
        column.data.defaultValue !== undefined,
        raw('default').value(column.data.defaultValue)
      )
  }

  formatType(type: ColumnType): Statement {
    switch (type) {
      case ColumnType.String:
      case ColumnType.Object:
      case ColumnType.Array:
        return raw('text')
      case ColumnType.Number:
      case ColumnType.Boolean:
        return raw('numeric')
      case ColumnType.Integer:
        return raw('integer')
    }
  }

  formatInsertRow(columns: Array<string>, row: Record<string, any>) {
    return parenthesis(
      separated(
        columns.map(column => {
          return value(row[column])
        })
      )
    )
  }

  formatTarget(target: Target, ctx: FormatContext): Statement {
    switch (target.type) {
      case TargetType.Collection:
        return ident(target.collection.alias || target.collection.name)
      case TargetType.Join:
        const {left, right, joinType} = target
        return this.formatTarget(left, ctx)
          .add(joins[joinType])
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
    return raw('where').add(this.formatExprValue(expr, ctx))
  }

  formatHaving(expr: ExprData | undefined, ctx: FormatContext) {
    if (!expr) return
    return raw('having').add(this.formatExprValue(expr, ctx))
  }

  formatGroupBy(groupBy: Array<ExprData> | undefined, ctx: FormatContext) {
    if (!groupBy) return
    return raw('group by').addSeparated(
      groupBy.map(expr => this.formatExprValue(expr, ctx))
    )
  }

  formatOrderBy(orderBy: Array<OrderBy> | undefined, ctx: FormatContext) {
    if (!orderBy) return
    return raw('order by').addSeparated(
      orderBy.map(({expr, order}) =>
        this.formatExprValue(expr, ctx).add(
          order === OrderDirection.Asc ? 'asc' : 'desc'
        )
      )
    )
  }

  formatLimit({limit, offset}: Query.Limit, ctx: FormatContext) {
    if (!limit && !offset) return
    return raw('limit')
      .addValue(limit)
      .addIf(offset && offset > 0, raw('offset').addValue(offset))
  }

  formatSelection(
    {selection, from}: Query.Select,
    ctx: FormatContext
  ): Statement {
    const {formatSubject} = ctx
    const subject = this.formatExpr(selection, {
      ...ctx,
      formatSubject: undefined,
      formatAsJson: true
    })
    return formatSubject ? formatSubject(subject) : subject
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
          case TargetType.Collection:
            return ident(
              expr.target.collection.alias || expr.target.collection.name
            )
              .raw('.')
              .ident(field)
          default:
            throw new Error('todo')
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

  formatValue(rawValue: any, formatAsJson?: boolean): Statement {
    switch (true) {
      case rawValue === null:
        return raw('null')
      case !formatAsJson && typeof rawValue === 'boolean':
        return rawValue ? raw('1') : raw('0')
      case Array.isArray(rawValue):
        const res = parenthesis(
          separated(rawValue.map((v: any) => this.formatValue(v, false)))
        )
        return formatAsJson ? raw('json_array').concat(res) : res
      case typeof rawValue === 'string' || typeof rawValue === 'number':
        return value(rawValue)
      default:
        return call('json', this.formatString(JSON.stringify(rawValue)))
    }
  }

  formatExpr(expr: ExprData, ctx: FormatContext): Statement {
    switch (expr.type) {
      case ExprType.UnOp:
        switch (expr.op) {
          case UnOp.IsNull:
            return this.formatExprValue(expr.expr, ctx).add('is null')
          case UnOp.Not:
            return raw('!').parenthesis(this.formatExprValue(expr.expr, ctx))
        }
      case ExprType.BinOp:
        return parenthesis(
          this.formatExprValue(expr.a, ctx)
            .add(binOps[expr.op])
            .add(this.formatIn(expr.b, ctx))
        )
      case ExprType.Param:
        switch (expr.param.type) {
          case ParamType.Value:
            return this.formatValue(expr.param.value, ctx.formatAsJson)
          case ParamType.Named:
            throw new Error('todo')
        }
      case ExprType.Field:
        return this.formatField(expr.expr, expr.field, ctx)
      case ExprType.Call: {
        const params = expr.params.map(expr => this.formatExprValue(expr, ctx))
        return call(expr.method, ...params)
      }
      case ExprType.Query:
        if (!ctx.formatAsJson) return parenthesis(this.format(expr.query, ctx))
        const subQuery = this.format(expr.query, {...ctx, nameResult: 'result'})
        if (expr.query.singleResult) return call('json', parenthesis(subQuery))
        return parenthesis(
          raw('select json_group_array(json(result)) from ').parenthesis(
            subQuery
          )
        )
      case ExprType.Row:
        const collection = Target.source(expr.target)
        if (!collection) throw new Error(`Cannot select empty target`)
        return this.formatExpr(
          ExprData.Record(
            Object.fromEntries(
              Object.entries(collection.columns).map(([key, column]) => [
                key,
                ExprData.Field(ExprData.Row(expr.target), column.name)
              ])
            )
          ),
          ctx
        )
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
              .raw(',')
              .add(this.formatExpr(value, {...ctx, formatAsJson: true}))
          })
        )
      default:
        console.log(expr)
        throw new Error('todo')
    }
  }
}
