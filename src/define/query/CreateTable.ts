import {Query} from '../Query.js'
import {Schema} from '../Schema.js'
import {TableData} from '../Table.js'

export class CreateTable extends Query<void> {
  constructor(protected table: TableData) {
    super(Schema.create(table))
  }
}
