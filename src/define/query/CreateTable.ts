import {Query} from '../Query'
import {Schema} from '../Schema'
import {TableData} from '../Table'

export class CreateTable extends Query<void> {
  constructor(protected table: TableData) {
    super(Schema.create(table))
  }
}
