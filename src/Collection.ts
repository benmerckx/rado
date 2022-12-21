import {Cursor} from './Cursor'
import {Expr, ExprData} from './Expr'
import {Fields} from './Fields'
import {From} from './From'
import {Selection} from './Selection'

export type CollectionOptions = {
  flat?: boolean
  columns?: Array<string>
  where?: Expr<boolean>
  alias?: string
  id?: CollectionId
}

interface CollectionId {
  property: string
  addToRow: (row: any, id: string) => any
  getFromRow: (row: any) => string
}

export class Collection<Row = any> extends Cursor<Row> {
  private __options: CollectionOptions
  __collectionId: CollectionId
  constructor(name: string, options: CollectionOptions = {}) {
    const {flat, columns, where, alias} = options
    const from = flat
      ? From.Table(name, columns || [], alias)
      : From.Column(From.Table(name, ['data'], alias), 'data')
    const row = ExprData.Row(from)
    const selection = row
    super({
      from,
      selection,
      where: where?.expr
    })
    this.__options = options
    this.__collectionId = options?.id || {
      property: 'id',
      addToRow: (row, id) => Object.assign({id}, row),
      getFromRow: row => row.id
    }
  }

  pick<Props extends Array<keyof Row>>(
    ...properties: Props
  ): Expr<{
    [K in Props[number]]: Row[K]
  }> {
    const fields: Record<string, ExprData> = {}
    for (const prop of properties)
      fields[prop as string] = this.get(prop as string).expr
    return new Expr<{
      [K in Props[number]]: Row[K]
    }>(ExprData.Record(fields))
  }

  get id() {
    return this.get(this.__collectionId.property) as Expr<string>
  }

  with<X extends Selection>(that: X): Expr.With<Row, X> {
    return this.fields.with(that)
  }

  as<T = Row>(name: string): Collection<T> & Fields<T> {
    return collection<T>(From.source(this.cursor.from), {
      ...this.__options,
      alias: name
    })
  }

  toExpr() {
    return this.fields
  }
}

export function collection<T>(
  name: string,
  options?: CollectionOptions
): Collection<T> & Fields<T> {
  return new Collection(name, options) as Collection<T> & Fields<T>
}
