import {Builder} from '../core/Builder.ts'
import type {IsSqlite} from '../core/MetaData.ts'
export const QueryBuilder: new () => Builder<IsSqlite> = Builder
