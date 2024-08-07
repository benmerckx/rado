import {Builder} from '../core/Builder.ts'
import type {IsMysql} from '../core/MetaData.ts'
export const QueryBuilder: new () => Builder<IsMysql> = Builder
