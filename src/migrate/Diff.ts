import type {QueryMeta} from '../core/MetaData.ts'
import type {Table} from '../core/Table.ts'
import type {TxGenerator} from '../universal.ts'

export interface Diff {
  <Meta extends QueryMeta>(table: Table): TxGenerator<Meta, Array<string>>
}
