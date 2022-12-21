import {Param, ParamData, ParamType} from './Param'

export class Sql {
  constructor(public sql: string, public params: Array<ParamData> = []) {}

  static EMPTY = new Sql('')

  static raw(sql: string) {
    return new Sql(sql)
  }

  static join(statements: Array<Sql | undefined>, separator: string) {
    const stmts = statements.filter((maybe: Sql | undefined): maybe is Sql => {
      return Boolean(maybe && maybe.sql)
    })
    return new Sql(
      stmts.map(s => s.sql).join(separator),
      stmts.flatMap(s => s.params)
    )
  }

  getParams(input?: Record<string, any>): Array<any> {
    return this.params.map(param => {
      switch (param.type) {
        case ParamType.Value:
          return param.value
        case ParamType.Named:
          if (!input) throw new Error('Missing input')
          return input[param.name]
      }
    })
  }
}

export function sql(
  strings: TemplateStringsArray,
  ...inserts: Array<undefined | Param | Sql>
): Sql {
  let buf = '',
    params: Array<ParamData> = []
  strings.forEach((string, i) => {
    buf += string
    const insert = inserts[i]
    if (insert instanceof Sql && insert.sql) {
      buf += insert.sql
      params.push(...insert.params)
    } else if (insert instanceof Param) {
      buf += '?'
      params.push(insert.param)
    }
  })
  return new Sql(buf, params)
}
