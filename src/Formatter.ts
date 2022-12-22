import {BinOp, ExprData, ExprType, UnOp} from './Expr'
import {OrderBy, OrderDirection} from './OrderBy'
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
  formatInline?: boolean
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

  compile<T>(query: Query<T>) {
    return this.format(query).compile(this)
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
    }
  }

  formatSelect(query: Query.Select, ctx: FormatContext) {
    return raw('select')
      .add(this.formatSelection(query.selection))
      .add('from')
      .add(this.formatTarget(query.from, ctx))
      .add(this.formatWhere(query.where, ctx))
      .add(this.formatGroupBy(query.groupBy, ctx))
      .add(this.formatHaving(query.having, ctx))
      .add(this.formatOrderBy(query.orderBy, ctx))
      .add(this.formatLimit(query, ctx))
  }

  formatInsert(query: Query.Insert, ctx: FormatContext) {
    const columns = Object.keys(query.into.columns)
    return raw('insert into')
      .addCall(
        query.into.name,
        ...columns.map(column => this.formatString(column))
      )
      .add('values')
      .addSeparated(query.data.map(row => this.formatInsertRow(columns, row)))
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
            .add(this.formatExprValue(data[column], ctx))
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

  formatSelection(selection: ExprData | undefined): Statement {
    if (!selection) return raw('*')
    return this.formatExpr(selection, {formatAsJson: true})
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
      case ExprType.Row:
        switch (expr.target.type) {
          case TargetType.Collection:
            return expr.target.collection.columns[field]
          default:
            throw 'todo'
        }
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
    return this.formatAccess(
      this.formatExpr(expr, ctx),
      field,
      ctx.formatAsJson
    )
  }

  formatString(input: string): Statement {
    return raw(this.escapeValue(String(input)))
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
        throw 'todo'
      case ExprType.Field:
        return this.formatField(expr.expr, expr.field, ctx)
      case ExprType.Call: {
        const params = expr.params.map(expr => this.formatExprValue(expr, ctx))
        return call(expr.method, ...params)
      }
      case ExprType.Query:
        if (!ctx.formatAsJson) return parenthesis(this.format(expr.query, ctx))
        const subQuery = this.format(expr.query, {...ctx, nameResult: 'res'})
        if (expr.query.singleResult) return call('json', parenthesis(subQuery))
        return parenthesis(
          raw('select json_group_array(json(res)) from ').parenthesis(subQuery)
        )
      case ExprType.Row:
        throw 'todo'
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
      case ExprType.Case:
        throw `Not supported in current formatter: _.case(...)`
    }
  }
}
