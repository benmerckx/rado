import {Builder} from '../core/Builder.ts'
import type {IsPostgres} from '../core/MetaData.ts'
export const QueryBuilder: new () => Builder<IsPostgres> = Builder
