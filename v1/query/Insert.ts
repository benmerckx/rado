import {Expr} from '../Expr.ts'
import {IsTable, type IsSql} from '../Is.ts'

class InsertIntoData {
  into!: IsTable
  values?: Record<string, IsSql>
  select?: IsSql
}

class InsertData extends InsertIntoData {
  returning?: IsSql
}

class Insert<Returning> {
  #data: InsertData
  constructor(data: InsertData) {
    this.#data = data
  }

  returning<T>(select: Expr<T>): Insert<T> {
    return new Insert({...this.#data, returning: select})
  }
}

export class InsertInto<Definition> {
  #data: InsertData
  constructor(data: InsertData) {
    this.#data = data
  }

  values(values: Definition) {
    return new Insert<Definition>({...this.#data, values})
  }

  select<T>(query: Expr<T>): Insert {
    return new Insert({...this.#data, select: query})
  }
}
